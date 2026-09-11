import { Router } from 'express';
import { query, queryOne } from '../config/db';
import { requireAuth } from '../middleware/auth';
import { getIO } from '../socket/socket';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user!.id]);
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const r = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [req.user!.id]);
    res.json({ success: true, data: { unreadCount: Number(r?.count ?? 0) } });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const row = await queryOne(`UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.id, req.user!.id]);
    const c = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [req.user!.id]);
    getIO()?.to(`user:${req.user!.id}`).emit('notification:read', { unreadCount: Number(c?.count ?? 0) });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [req.user!.id]);
    getIO()?.to(`user:${req.user!.id}`).emit('notification:read', { unreadCount: 0 });
    res.json({ success: true, data: { message: 'All marked read' } });
  } catch (e) {
    next(e);
  }
});

export default router;
