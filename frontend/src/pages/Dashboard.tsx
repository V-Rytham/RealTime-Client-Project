import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import ActivityFeed from '../components/ActivityFeed';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    api.get('/api/dashboard').then((r) => {
      setData(r.data.data);
      if (r.data.data.onlineCount !== undefined) setOnline(r.data.data.onlineCount);
    }).catch(() => {});
  }, []);

  useSocket((s) => {
    s.on('presence:update', (p: any) => setOnline(p.onlineCount));
  });

  if (!data) return <div>Loading dashboard…</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>{user?.role} Dashboard — Hi {user?.name}</h2>
      {user?.role === 'ADMIN' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="card">Total Projects: <b>{data.totalProjects}</b></div>
          <div className="card">Overdue: <b>{data.overdueCount}</b></div>
          <div className="card">Online now (live): <b>{online ?? data.onlineCount}</b></div>
          <div className="card">By status: <pre>{JSON.stringify(data.tasksByStatus, null, 2)}</pre></div>
        </div>
      )}
      {user?.role === 'PM' && (
        <>
          <div className="card">My projects: {data.projects?.length} <pre>{JSON.stringify(data.projects?.slice(0, 5), null, 2)}</pre></div>
          <div className="card">By priority: <pre>{JSON.stringify(data.tasksByPriority, null, 2)}</pre></div>
          <div className="card">Due this week: <pre>{JSON.stringify(data.upcoming, null, 2)}</pre></div>
        </>
      )}
      {user?.role === 'DEVELOPER' && (
        <div className="card">My tasks ({data.tasks?.length}): <pre>{JSON.stringify(data.tasks?.slice(0, 10), null, 2)}</pre></div>
      )}
      <ActivityFeed />
    </div>
  );
}
