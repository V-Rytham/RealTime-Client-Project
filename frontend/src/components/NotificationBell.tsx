import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useSocket } from '../hooks/useSocket';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const [c, list] = await Promise.all([api.get('/api/notifications/unread-count'), api.get('/api/notifications')]);
    setCount(c.data.data.unreadCount);
    setItems(list.data.data);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useSocket((socket) => {
    socket.on('notification:new', (p: any) => {
      setCount(p.unreadCount);
      setItems((prev) => [p.notification, ...prev]);
    });
    socket.on('notification:read', (p: any) => setCount(p.unreadCount));
  });

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(!open); if (!open) load().catch(() => {}); }}>
        🔔 {count > 0 && <span className="badge">{count}</span>}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, width: 320, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>Notifications</b>
            <button onClick={async () => { await api.post('/api/notifications/read-all'); setCount(0); setItems((p) => p.map((n) => ({ ...n, is_read: true }))); }}>Mark all read</button>
          </div>
          {items.map((n) => (
            <div key={n.id} className="feed-item">
              <div><b>{n.title}</b> {!n.is_read && <span className="badge">new</span>}</div>
              <div className="muted">{n.body}</div>
              {!n.is_read && <button onClick={async () => { await api.patch(`/api/notifications/${n.id}/read`); setItems((p) => p.map((x) => x.id === n.id ? { ...x, is_read: true } : x)); setCount((c) => Math.max(0, c - 1)); }}>Mark read</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
