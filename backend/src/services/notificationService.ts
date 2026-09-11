import { query, queryOne } from '../config/db';
import { getIO } from '../socket/socket';

export async function createNotification(input: {
  userId: number;
  type: string;
  title: string;
  body?: string;
  taskId?: number | null;
  projectId?: number | null;
}) {
  const row = await queryOne(
    `INSERT INTO notifications (user_id, type, title, body, task_id, project_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.userId, input.type, input.title, input.body ?? '', input.taskId ?? null, input.projectId ?? null]
  );
  // Real-time unread-count push (no polling)
  try {
    const unread = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
      [input.userId]
    );
    getIO()?.to(`user:${input.userId}`).emit('notification:new', { notification: row, unreadCount: Number(unread?.count ?? 1) });
  } catch {}
  return row;
}
