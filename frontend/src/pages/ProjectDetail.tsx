import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import TaskList from '../components/TaskList';
import ActivityFeed from '../components/ActivityFeed';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'MEDIUM', due_date: '' });

  useEffect(() => {
    api.get(`/api/projects/${id}`).then((r) => setProject(r.data.data)).catch(() => {});
  }, [id]);

  const createTask = async () => {
    await api.post('/api/tasks', {
      project_id: Number(id),
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      priority: form.priority,
      due_date: form.due_date || null,
    });
    const r = await api.get(`/api/projects/${id}`);
    setProject(r.data.data);
  };

  if (!project) return <div>Loading…</div>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>#{project.id} {project.name}</h2>
      <div className="card">
        <h4>New task</h4>
        <input placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input placeholder="assigned developer id" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} />
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
        </select>
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        <button onClick={createTask}>Create task</button>
      </div>
      <TaskList projectId={Number(id)} />
      <ActivityFeed projectId={Number(id)} />
    </div>
  );
}
