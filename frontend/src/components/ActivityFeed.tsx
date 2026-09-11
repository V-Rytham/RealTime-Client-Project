import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useSocket, timeAgo } from '../hooks/useSocket';

export interface Activity {
  id: number;
  message: string;
  created_at: string;
  actor_name?: string;
  project_name?: string;
}

export default function ActivityFeed({ projectId }: { projectId?: number }) {
  const [items, setItems] = useState<Activity[]>([]);

  const load = async () => {
    // Missed-event catchup: last 20 from DB (not memory) on mount / reconnect
    const r = await api.get('/api/activity', { params: { projectId, limit: 20 } });
    setItems(r.data.data);
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useSocket((socket) => {
    if (projectId) socket.emit('project:join', projectId);
    socket.on('activity:new', (a: Activity) => {
      setItems((prev) => [a, ...prev].slice(0, 50));
    });
    socket.on('connect', () => load().catch(() => {}));
  });

  return (
    <div className="card">
      <h3>Live Activity Feed</h3>
      {items.length === 0 && <div className="muted">No activity yet.</div>}
      {items.map((a) => (
        <div key={a.id} className="feed-item">
          <div>{a.message}</div>
          <div className="muted">· {timeAgo(a.created_at)}</div>
        </div>
      ))}
    </div>
  );
}
