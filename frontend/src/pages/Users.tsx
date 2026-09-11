import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => { api.get('/api/users').then((r) => setUsers(r.data.data)).catch(() => {}); }, []);
  return (
    <div className="card">
      <h2>Users (Admin only)</h2>
      <table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th></tr></thead>
      <tbody>{users.map((u) => <tr key={u.id}><td>{u.id}</td><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody></table>
    </div>
  );
}
