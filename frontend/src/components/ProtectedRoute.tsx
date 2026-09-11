import { Navigate } from 'react-router-dom';
import { useAuth, type Role } from '../context/AuthContext';

export default function ProtectedRoute({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <div>403 — Forbidden for role {user.role}</div>;
  return children;
}
