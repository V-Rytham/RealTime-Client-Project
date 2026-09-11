import { query, queryOne } from '../config/db';

export interface ActivityRow {
  id: number;
  project_id: number | null;
  task_id: number | null;
  actor_id: number | null;
  action: string;
  message: string;
  metadata: any;
  created_at: string;
  actor_name?: string;
  task_title?: string;
  project_name?: string;
}

export async function createActivity(input: {
  projectId: number | null;
  taskId: number | null;
  actorId: number | null;
  action: string;
  message: string;
  metadata?: any;
}): Promise<ActivityRow> {
  const row = await queryOne<ActivityRow>(
    `INSERT INTO activity_logs (project_id, task_id, actor_id, action, message, metadata)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'{}'::jsonb)) RETURNING *`,
    [input.projectId, input.taskId, input.actorId, input.action, input.message, JSON.stringify(input.metadata ?? {})]
  );
  return row!;
}

export function formatStatusChange(actorName: string, taskId: number, from: string | null, to: string): string {
  const pretty = (s: string | null) => (s ? s.replace('_', ' ') : '—');
  return `${actorName} moved Task #${taskId} from ${pretty(from)} → ${pretty(to)}`;
}

/** Role-filtered activity query. Developers only see their own tasks. PMs only their projects. */
export async function listActivityFor(user: { id: number; role: string }, opts: { projectId?: number; taskId?: number; limit?: number }): Promise<ActivityRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  if (user.role === 'ADMIN') {
    return query<ActivityRow>(
      `SELECT a.*, u.name AS actor_name, t.title AS task_title, p.name AS project_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE ($1::int IS NULL OR a.project_id = $1) AND ($2::int IS NULL OR a.task_id = $2)
       ORDER BY a.created_at DESC LIMIT $3`,
      [opts.projectId ?? null, opts.taskId ?? null, limit]
    );
  }
  if (user.role === 'PM') {
    return query<ActivityRow>(
      `SELECT a.*, u.name AS actor_name, t.title AS task_title, p.name AS project_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN projects p ON p.id = a.project_id
       JOIN projects pp ON pp.id = a.project_id AND pp.created_by = $1
       WHERE ($2::int IS NULL OR a.project_id = $2) AND ($3::int IS NULL OR a.task_id = $3)
       ORDER BY a.created_at DESC LIMIT $4`,
      [user.id, opts.projectId ?? null, opts.taskId ?? null, limit]
    );
  }
  // DEVELOPER
  return query<ActivityRow>(
    `SELECT a.*, u.name AS actor_name, t.title AS task_title, p.name AS project_name
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     LEFT JOIN tasks t ON t.id = a.task_id
     LEFT JOIN projects p ON p.id = a.project_id
     JOIN tasks mine ON mine.id = a.task_id AND mine.assigned_to = $1
     WHERE ($2::int IS NULL OR a.project_id = $2) AND ($3::int IS NULL OR a.task_id = $3)
     ORDER BY a.created_at DESC LIMIT $4`,
    [user.id, opts.projectId ?? null, opts.taskId ?? null, limit]
  );
}
