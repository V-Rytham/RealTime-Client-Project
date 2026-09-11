import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@velozity.com');
  const [password, setPassword] = useState('Password123!');
  const [err, setErr] = useState('');

  // quick register helper for demo
  const [reg, setReg] = useState({ name: '', email: '', password: '', role: 'DEVELOPER' });

  return (
    <div style={{ maxWidth: 480, margin: '40px auto' }} className="card">
      <h2>Velozity Dashboard — Login</h2>
      <p className="muted">Seed logins: admin@velozity.com / pm1@velozity.com / dev1@velozity.com (Password123!)</p>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <button onClick={async () => { try { await login(email, password); nav('/'); } catch (e: any) { setErr(e.response?.data?.error?.message || 'Login failed'); } }} style={{ width: '100%' }}>Login</button>
      <hr />
      <h4>Quick register (demo)</h4>
      <input placeholder="name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} style={{ width: '100%', marginBottom: 4 }} />
      <input placeholder="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} style={{ width: '100%', marginBottom: 4 }} />
      <input placeholder="password" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} style={{ width: '100%', marginBottom: 4 }} />
      <select value={reg.role} onChange={(e) => setReg({ ...reg, role: e.target.value })}>
        <option value="DEVELOPER">Developer</option>
        <option value="PM">PM</option>
        <option value="ADMIN">Admin</option>
      </select>
      <button onClick={async () => { await api.post('/api/auth/register', reg); alert('Registered — now login'); }}>Register</button>
      <div><Link to="/login">Refresh</Link></div>
    </div>
  );
}
