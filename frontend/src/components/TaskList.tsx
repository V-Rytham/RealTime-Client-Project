import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function TaskList({ projectId }: { projectId?: number }) {
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<any[]>([]);

  const status = params.get('status') || '';
  const priority = params.get('priority') || '';
  const dueFrom = params.get('dueFrom') || '';
  const dueTo = params.get('dueTo') || '';

  useEffect(() => {
    api.get('/api/tasks', { params: { projectId, status: status || undefined, priority: priority || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined } })
      .then((r) => setTasks(r.data.data)).catch(() => {});
  }, [projectId, status, priority, dueFrom, dueTo]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  const move = async (id: number, s: string) => {
    await api.patch(`/api/tasks/${id}/status`, { status: s });
    const r = await api.get('/api/tasks', { params: { projectId } });
    setTasks(r.data.data);
  };

  return (
    <div className="card">
      <h3>Tasks (filters are in URL — shareable)</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
        <select value={priority} onChange={(e) => set('priority', e.target.value)}>
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <input type="date" value={dueFrom} onChange={(e) => set('dueFrom', e.target.value)} />
        <input type="date" value={dueTo} onChange={(e) => set('dueTo', e.target.value)} />
      </div>
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Priority</th><th>Due</th><th>Assignee</th><th>Overdue</th><th>Action</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>#{t.id}</td>
              <td>{t.title}</td>
              <td>{t.status}</td>
              <td>{t.priority}</td>
              <td>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
              <td>{t.assignee_name ?? t.assigned_to ?? '—'}</td>
              <td>{t.is_overdue ? '⚠️ Overdue' : ''}</td>
              <td>
                <select defaultValue={t.status} onChange={(e) => move(t.id, e.target.value)}>
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="DONE">Done</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
