import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../utils/errors';
import { createActivity, formatStatusChange } from '../services/activityService';
import { createNotification } from '../services/notificationService';
import { emitActivity } from '../socket/socket';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({
  projectId: z.coerce.number().int().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
});

async function assertProjectAccess(projectId: number, user: { id: number; role: string }) {
  const p: any = await queryOne(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  if (!p) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  if (user.role === 'ADMIN') return p;
  if (user.role === 'PM' && p.created_by !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Not your project');
  if (user.role === 'DEVELOPER') {
    // developers checked per-task below; project-level list limited to assigned tasks
    return p;
  }
  return p;
}

// GET /api/tasks?projectId=&status=&priority=&dueFrom=&dueTo=  (shareable URL filters)
router.get('/', validateQuery(listQuery), async (req: any, res, next) => {
  try {
    const u = req.user!;
    const { projectId, status, priority, dueFrom, dueTo } = req.query;
    const conds: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (u.role === 'DEVELOPER') {
      conds.push(`t.assigned_to = $${i++}`);
      vals.push(u.id);
    } else if (u.role === 'PM') {
      conds.push(`p.created_by = $${i++}`);
      vals.push(u.id);
    }
    if (projectId) {
      conds.push(`t.project_id = $${i++}`);
      vals.push(projectId);
    }
    if (status) {
      conds.push(`t.status = $${i++}`);
      vals.push(status);
    }
    if (priority) {
      conds.push(`t.priority = $${i++}`);
      vals.push(priority);
    }
    if (dueFrom) {
      conds.push(`t.due_date >= $${i++}`);
      vals.push(dueFrom);
    }
    if (dueTo) {
      conds.push(`t.due_date <= $${i++}`);
      vals.push(dueTo);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT t.*, u.name AS assignee_name, p.name AS project_name
       FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assigned_to
       ${where} ORDER BY t.priority DESC, t.due_date ASC NULLS LAST, t.id`,
      vals
    );
    // Developer sorting requirement: priority then due date — handled in ORDER BY above.
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  project_id: z.number().int(),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().default(''),
  assigned_to: z.number().int().nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  due_date: z.string().nullable().optional(),
});

router.post('/', requireRole('ADMIN', 'PM'), validateBody(createSchema), async (req, res, next) => {
  try {
    const u = req.user!;
    await assertProjectAccess(req.body.project_id, u);
    if (req.body.assigned_to) {
      const dev: any = await queryOne(`SELECT id, role FROM users WHERE id=$1`, [req.body.assigned_to]);
      if (!dev) throw new HttpError(404, 'NOT_FOUND', 'Assignee not found');
      if (dev.role !== 'DEVELOPER') throw new HttpError(400, 'BAD_REQUEST', 'Can only assign to developers');
    }
    const row: any = await queryOne(
      `INSERT INTO tasks (project_id, title, description, assigned_to, status, priority, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.body.project_id, req.body.title, req.body.description ?? '', req.body.assigned_to ?? null, req.body.status, req.body.priority, req.body.due_date ?? null, u.id]
    );
    const activity: any = await createActivity({
      projectId: row.project_id,
      taskId: row.id,
      actorId: u.id,
      action: 'TASK_CREATED',
      message: `${u.name} created Task #${row.id} (${row.title})`,
      metadata: { taskId: row.id },
    });
    emitActivity({ ...activity, actor_name: u.name }, row.project_id);
    if (row.assigned_to) {
      await createNotification({
        userId: row.assigned_to,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
        body: `You were assigned Task #${row.id}: ${row.title}`,
        taskId: row.id,
        projectId: row.project_id,
      });
    }
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({ status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']) });

// PATCH /api/tasks/:id/status — allowed for ADMIN, owning PM, or assigned developer
router.patch('/:id/status', validateBody(statusSchema), async (req, res, next) => {
  try {
    const u = req.user!;
    const task: any = await queryOne(`SELECT t.*, p.created_by AS project_owner FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1`, [req.params.id]);
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found');

    const isAdmin = u.role === 'ADMIN';
    const isOwnerPM = u.role === 'PM' && task.project_owner === u.id;
    const isAssignee = task.assigned_to === u.id;
    if (!(isAdmin || isOwnerPM || isAssignee)) throw new HttpError(403, 'FORBIDDEN', 'No access to this task');

    const oldStatus = task.status;
    const newStatus = req.body.status;
    if (oldStatus === newStatus) {
      return res.json({ success: true, data: task });
    }
    const updated: any = await queryOne(`UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [newStatus, task.id]);
    await query(`INSERT INTO task_status_history (task_id, old_status, new_status, changed_by) VALUES ($1,$2,$3,$4)`, [task.id, oldStatus, newStatus, u.id]);

    const message = formatStatusChange(u.name, task.id, oldStatus, newStatus);
    const activity: any = await createActivity({
      projectId: task.project_id,
      taskId: task.id,
      actorId: u.id,
      action: 'TASK_STATUS_CHANGED',
      message,
      metadata: { taskId: task.id, from: oldStatus, to: newStatus },
    });
    const enriched = { ...activity, actor_name: u.name };
    emitActivity(enriched, task.project_id);
    // Also push to assignee + PM rooms so role-filtered feeds update live
    const { getIO } = await import('../socket/socket');
    getIO()?.to(`user:${task.assigned_to}`).emit('activity:new', enriched);
    getIO()?.to(`user:${task.project_owner}`).emit('activity:new', enriched);

    // Notification: task moved to IN_REVIEW -> notify PM owner
    if (newStatus === 'IN_REVIEW' && task.project_owner && task.project_owner !== u.id) {
      await createNotification({
        userId: task.project_owner,
        type: 'TASK_IN_REVIEW',
        title: 'Task needs review',
        body: `Task #${task.id} moved to In Review by ${u.name}`,
        taskId: task.id,
        projectId: task.project_id,
      });
    }
    res.json({ success: true, data: { task: updated, activity: enriched } });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const task: any = await queryOne(`SELECT * FROM tasks WHERE id=$1`, [req.params.id]);
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
    const u = req.user!;
    if (u.role === 'DEVELOPER' && task.assigned_to !== u.id) throw new HttpError(403, 'FORBIDDEN', 'No access');
    if (u.role === 'PM') {
      const p: any = await queryOne(`SELECT created_by FROM projects WHERE id=$1`, [task.project_id]);
      if (p?.created_by !== u.id) throw new HttpError(403, 'FORBIDDEN', 'Not your project');
    }
    const rows = await query(
      `SELECT h.*, u.name AS changed_by_name FROM task_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.task_id=$1 ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('ADMIN', 'PM'), async (req, res, next) => {
  try {
    const task: any = await queryOne(`SELECT t.*, p.created_by FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1`, [req.params.id]);
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
    if (req.user!.role === 'PM' && task.created_by !== req.user!.id) {
      const p: any = await queryOne(`SELECT created_by FROM projects WHERE id=$1`, [task.project_id]);
      if (p?.created_by !== req.user!.id) throw new HttpError(403, 'FORBIDDEN', 'Not your project');
    }
    await query(`DELETE FROM tasks WHERE id=$1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Deleted' } });
  } catch (e) {
    next(e);
  }
});

export default router;
