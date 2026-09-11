import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db';

/**
 * Seed: 1 Admin, 2 PMs, 4 Developers, 3 clients, 3 projects x 5+ tasks,
 * 2+ overdue tasks, pre-existing activity logs + notifications.
 * All via parameterized raw SQL (pg). No ORM.
 */
async function main() {
  const q = (t: string, p?: any[]) => pool.query(t, p);

  await q(`DELETE FROM notifications`);
  await q(`DELETE FROM activity_logs`);
  await q(`DELETE FROM task_status_history`);
  await q(`DELETE FROM tasks`);
  await q(`DELETE FROM projects`);
  await q(`DELETE FROM clients`);
  await q(`DELETE FROM refresh_tokens`);
  await q(`DELETE FROM users`);

  const hash = await bcrypt.hash('Password123!', 10);
  const mkUser = async (name: string, email: string, role: string) => {
    const r = await q(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING *`, [name, email, hash, role]);
    return r.rows[0];
  };

  const admin = await mkUser('Asha Admin', 'admin@velozity.com', 'ADMIN');
  const pm1 = await mkUser('Priya PM', 'pm1@velozity.com', 'PM');
  const pm2 = await mkUser('Karan PM', 'pm2@velozity.com', 'PM');
  const dev1 = await mkUser('Ravi Dev', 'dev1@velozity.com', 'DEVELOPER');
  const dev2 = await mkUser('Sana Dev', 'dev2@velozity.com', 'DEVELOPER');
  const dev3 = await mkUser('Arjun Dev', 'dev3@velozity.com', 'DEVELOPER');
  const dev4 = await mkUser('Meera Dev', 'dev4@velozity.com', 'DEVELOPER');

  const mkClient = async (name: string, email: string, by: number) => {
    const r = await q(`INSERT INTO clients (name, contact_email, created_by) VALUES ($1,$2,$3) RETURNING *`, [name, email, by]);
    return r.rows[0];
  };
  const c1 = await mkClient('Acme Retail', 'cto@acme.com', admin.id);
  const c2 = await mkClient('FinEdge', 'eng@finedge.com', pm1.id);
  const c3 = await mkClient('HealthPlus', 'it@healthplus.com', pm2.id);

  const mkProject = async (name: string, desc: string, client: number, by: number) => {
    const r = await q(`INSERT INTO projects (name, description, client_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [name, desc, client, by]);
    return r.rows[0];
  };
  const p1 = await mkProject('Acme Storefront Revamp', 'Next.js storefront + CMS', c1.id, pm1.id);
  const p2 = await mkProject('FinEdge KYC Portal', 'KYC onboarding flow', c2.id, pm1.id);
  const p3 = await mkProject('HealthPlus Appointments', 'Booking + reminders', c3.id, pm2.id);

  const past = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

  type T = { p: any; title: string; dev: any; status: string; pri: string; due: string; by: any };
  const tasks: T[] = [
    { p: p1, title: 'Setup repo + CI', dev: dev1, status: 'DONE', pri: 'HIGH', due: past(10), by: pm1 },
    { p: p1, title: 'Homepage hero', dev: dev1, status: 'IN_REVIEW', pri: 'MEDIUM', due: future(2), by: pm1 },
    { p: p1, title: 'Product listing + filters', dev: dev2, status: 'IN_PROGRESS', pri: 'HIGH', due: future(4), by: pm1 },
    { p: p1, title: 'Cart + checkout', dev: dev2, status: 'TODO', pri: 'CRITICAL', due: future(6), by: pm1 },
    { p: p1, title: 'CMS integration', dev: dev3, status: 'TODO', pri: 'MEDIUM', due: past(2), by: pm1 }, // overdue
    { p: p1, title: 'SEO + analytics', dev: dev3, status: 'TODO', pri: 'LOW', due: future(9), by: pm1 },
    { p: p2, title: 'KYC schema design', dev: dev3, status: 'DONE', pri: 'HIGH', due: past(8), by: pm1 },
    { p: p2, title: 'Document upload API', dev: dev3, status: 'IN_PROGRESS', pri: 'CRITICAL', due: future(3), by: pm1 },
    { p: p2, title: 'Admin review queue', dev: dev4, status: 'TODO', pri: 'HIGH', due: future(5), by: pm1 },
    { p: p2, title: 'Audit logs', dev: dev4, status: 'TODO', pri: 'MEDIUM', due: past(1), by: pm1 }, // overdue
    { p: p2, title: 'Email notifications', dev: dev1, status: 'TODO', pri: 'LOW', due: future(7), by: pm1 },
    { p: p3, title: 'Doctor availability calendar', dev: dev4, status: 'IN_PROGRESS', pri: 'HIGH', due: future(2), by: pm2 },
    { p: p3, title: 'Slot booking API', dev: dev4, status: 'TODO', pri: 'CRITICAL', due: future(4), by: pm2 },
    { p: p3, title: 'SMS reminders (cron)', dev: dev2, status: 'IN_REVIEW', pri: 'MEDIUM', due: future(1), by: pm2 },
    { p: p3, title: 'Patient history view', dev: dev1, status: 'TODO', pri: 'LOW', due: future(8), by: pm2 },
  ];

  const taskRows: any[] = [];
  for (const t of tasks) {
    const overdue = new Date(t.due) < new Date() && t.status !== 'DONE';
    const r = await q(
      `INSERT INTO tasks (project_id, title, description, assigned_to, status, priority, due_date, is_overdue, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [t.p.id, t.title, `${t.title} — demo task`, t.dev.id, t.status, t.pri, t.due, overdue, t.by.id]
    );
    taskRows.push(r.rows[0]);
  }

  // activity logs (feed not empty) + history
  for (const t of taskRows) {
    await q(`INSERT INTO task_status_history (task_id, old_status, new_status, changed_by) VALUES ($1,$2,$3,$4)`, [
      t.id,
      null,
      t.status,
      t.created_by,
    ]);
    const actorName = t.created_by === pm1.id ? pm1.name : pm2.name;
    await q(
      `INSERT INTO activity_logs (project_id, task_id, actor_id, action, message, metadata, created_at)
       VALUES ($1,$2,$3,'TASK_STATUS_CHANGED',$4,$5,$6)`,
      [t.project_id, t.id, t.created_by, `${actorName} moved Task #${t.id} from TODO → ${t.status.replace('_', ' ')}`, JSON.stringify({ from: 'TODO', to: t.status }), new Date(Date.now() - Math.floor(Math.random() * 72) * 3600000).toISOString()]
    );
  }
  // extra feed line matching spec example
  await q(
    `INSERT INTO activity_logs (project_id, task_id, actor_id, action, message, metadata) VALUES ($1,$2,$3,'TASK_STATUS_CHANGED',$4,$5)`,
    [taskRows[2].project_id, taskRows[2].id, dev2.id, `Ravi moved Task #${taskRows[2].id} from In Progress → In Review`, JSON.stringify({ from: 'IN_PROGRESS', to: 'IN_REVIEW' })]
  );

  // notifications
  for (const t of taskRows.slice(0, 6)) {
    await q(`INSERT INTO notifications (user_id, type, title, body, task_id, project_id) VALUES ($1,'TASK_ASSIGNED','New task assigned',$2,$3,$4)`, [
      t.assigned_to,
      `You were assigned Task #${t.id}: ${t.title}`,
      t.id,
      t.project_id,
    ]);
  }
  await q(`INSERT INTO notifications (user_id, type, title, body, task_id, project_id) VALUES ($1,'TASK_IN_REVIEW','Task needs review',$2,$3,$4)`, [
    pm1.id,
    `Task #${taskRows[1].id} moved to In Review`,
    taskRows[1].id,
    taskRows[1].project_id,
  ]);

  console.log('[seed] done: admin@velozity.com / pm1@velozity.com / dev1@velozity.com (Password123!)');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
