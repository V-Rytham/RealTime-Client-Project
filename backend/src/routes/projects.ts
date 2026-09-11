import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../utils/errors';
import { createActivity } from '../services/activityService';

const router = Router();
router.use(requireAuth);

async function getProjectOrThrow(id: number, user: { id: number; role: string }) {
  const p: any = await queryOne(`SELECT * FROM projects WHERE id=$1`, [id]);
  if (!p) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  if (user.role === 'ADMIN') return p;
  if (user.role === 'PM') {
    if (p.created_by !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Not your project');
    return p;
  }
  // DEVELOPER: must have at least one assigned task in project
  const t = await queryOne(`SELECT id FROM tasks WHERE project_id=$1 AND assigned_to=$2 LIMIT 1`, [id, user.id]);
  if (!t) throw new HttpError(403, 'FORBIDDEN', 'No access to this project');
  return p;
}

router.get('/', async (req, res, next) => {
  try {
    const u = req.user!;
    let rows;
    if (u.role === 'ADMIN') {
      rows = await query(`SELECT p.*, c.name AS client_name, u.name AS owner_name FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=p.created_by ORDER BY p.id DESC`);
    } else if (u.role === 'PM') {
      rows = await query(`SELECT p.*, c.name AS client_name FROM projects p LEFT JOIN clients c ON c.id=p.client_id WHERE p.created_by=$1 ORDER BY p.id DESC`, [u.id]);
    } else {
      rows = await query(
        `SELECT DISTINCT p.*, c.name AS client_name FROM projects p
         LEFT JOIN clients c ON c.id=p.client_id
         JOIN tasks t ON t.project_id=p.id AND t.assigned_to=$1 ORDER BY p.id DESC`,
        [u.id]
      );
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional().default(''),
  client_id: z.number().int().nullable().optional(),
});

router.post('/', requireRole('ADMIN', 'PM'), validateBody(createSchema), async (req, res, next) => {
  try {
    const row = await queryOne(`INSERT INTO projects (name, description, client_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [
      req.body.name,
      req.body.description ?? '',
      req.body.client_id ?? null,
      req.user!.id,
    ]);
    await createActivity({
      projectId: (row as any).id,
      taskId: null,
      actorId: req.user!.id,
      action: 'PROJECT_CREATED',
      message: `${req.user!.name} created project ${(row as any).name}`,
      metadata: { projectId: (row as any).id },
    });
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const p = await getProjectOrThrow(Number(req.params.id), req.user!);
    const tasks = await query(`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.project_id=$1 ORDER BY t.id`, [p.id]);
    res.json({ success: true, data: { ...p, tasks } });
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  client_id: z.number().int().nullable().optional(),
});

router.put('/:id', requireRole('ADMIN', 'PM'), validateBody(updateSchema), async (req, res, next) => {
  try {
    await getProjectOrThrow(Number(req.params.id), req.user!);
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const k of ['name', 'description', 'client_id'] as const) {
      if (req.body[k] !== undefined) {
        fields.push(`${k}=$${i++}`);
        vals.push(req.body[k]);
      }
    }
    if (!fields.length) throw new HttpError(400, 'BAD_REQUEST', 'Nothing to update');
    vals.push(req.params.id);
    const row = await queryOne(`UPDATE projects SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('ADMIN', 'PM'), async (req, res, next) => {
  try {
    await getProjectOrThrow(Number(req.params.id), req.user!);
    await query(`DELETE FROM projects WHERE id=$1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Deleted' } });
  } catch (e) {
    next(e);
  }
});

export default router;
