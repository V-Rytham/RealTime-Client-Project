import { Router } from 'express';
import { query } from '../config/db';
import { requireAuth } from '../middleware/auth';
import { getOnlineCount } from '../socket/socket';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const u = req.user!;
    if (u.role === 'ADMIN') {
      const [[projects], [byStatus], [overdue]] = await Promise.all([
        query(`SELECT COUNT(*)::int AS c FROM projects`),
        query(`SELECT status, COUNT(*)::int AS c FROM tasks GROUP BY status`),
        query(`SELECT COUNT(*)::int AS c FROM tasks WHERE is_overdue=TRUE AND status<>'DONE'`),
      ] as any);
      return res.json({
        success: true,
        data: {
          totalProjects: (projects as any)[0]?.c ?? 0,
          tasksByStatus: byStatus,
          overdueCount: (overdue as any)[0]?.c ?? 0,
          onlineCount: getOnlineCount(),
        },
      });
    }
    if (u.role === 'PM') {
      const [projects, byPriority, upcoming] = await Promise.all([
        query(`SELECT id, name FROM projects WHERE created_by=$1`, [u.id]),
        query(
          `SELECT t.priority, COUNT(*)::int AS c FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.created_by=$1 GROUP BY t.priority`,
          [u.id]
        ),
        query(
          `SELECT t.id, t.title, t.due_date, t.priority, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id
           WHERE p.created_by=$1 AND t.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND t.status<>'DONE' ORDER BY t.due_date LIMIT 20`,
          [u.id]
        ),
      ]);
      return res.json({ success: true, data: { projects, tasksByPriority: byPriority, upcoming } });
    }
    // DEVELOPER: assigned tasks sorted by priority then due date
    const rows = await query(
      `SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE t.assigned_to=$1 ORDER BY
         CASE t.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         t.due_date ASC NULLS LAST`,
      [u.id]
    );
    return res.json({ success: true, data: { tasks: rows } });
  } catch (e) {
    next(e);
  }
});

export default router;
