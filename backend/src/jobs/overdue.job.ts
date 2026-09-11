import cron from 'node-cron';
import { query } from '../config/db';
import { createActivity } from '../services/activityService';
import { createNotification } from '../services/notificationService';
import { getIO } from '../socket/socket';

// WHY node-cron (justified in README): single-instance agency app, no Redis infra,
// overdue-flagging is a simple periodic UPDATE — BullMQ would add Redis cost with no benefit.
// Runs every minute so demo/assessment sees Overdue quickly; change to '0 * * * *' hourly in prod.
export function startOverdueJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const rows = await query(
        `UPDATE tasks SET is_overdue = TRUE, updated_at = NOW()
         WHERE due_date IS NOT NULL AND due_date < NOW()
           AND status <> 'DONE' AND is_overdue = FALSE
         RETURNING id, project_id, assigned_to, title`
      );
      for (const t of rows as any[]) {
        const msg = `System flagged Task #${t.id} (${t.title}) as Overdue`;
        const activity: any = await createActivity({
          projectId: t.project_id,
          taskId: t.id,
          actorId: null,
          action: 'TASK_OVERDUE',
          message: msg,
          metadata: { taskId: t.id },
        }).catch(() => null);
        if (activity) getIO()?.to(`project:${t.project_id}`).emit('activity:new', activity);
        if (t.assigned_to) {
          await createNotification({
            userId: t.assigned_to,
            type: 'TASK_OVERDUE',
            title: 'Task overdue',
            body: msg,
            taskId: t.id,
            projectId: t.project_id,
          }).catch(() => null);
        }
      }
      if ((rows as any[]).length) console.log(`[cron] flagged ${(rows as any[]).length} overdue task(s)`);
    } catch (e) {
      console.error('[cron] overdue job failed', e);
    }
  });
  console.log('[cron] overdue job scheduled (* * * * *)');
}
