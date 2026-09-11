import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', description: '', client_id: '' });

  const load = () => api.get('/api/projects').then((r) => setProjects(r.data.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api.post('/api/projects', { name: form.name, description: form.description, client_id: form.client_id ? Number(form.client_id) : null });
    setForm({ name: '', description: '', client_id: '' });
    load();
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>Projects</h2>
      {(user?.role === 'ADMIN' || user?.role === 'PM') && (
        <div className="card">
          <h4>New project</h4>
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input placeholder="client_id (optional)" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
          <button onClick={create}>Create</button>
        </div>
      )}
      {projects.map((p) => (
        <div key={p.id} className="card">
          <Link to={`/projects/${p.id}`}><b>#{p.id} {p.name}</b></Link>
          <div className="muted">{p.client_name || ''} — {p.description}</div>
        </div>
      ))}
    </div>
  );
}
