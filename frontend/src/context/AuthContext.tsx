import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../api/client';

export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';
export interface User { id: number; name: string; email: string; role: Role; }

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try silent refresh on load (HttpOnly cookie)
    api.post('/api/auth/refresh').then((r) => {
      setAccessToken(r.data.data.accessToken);
      setUser(r.data.data.user);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post('/api/auth/login', { email, password });
    setAccessToken(r.data.data.accessToken);
    setUser(r.data.data.user);
  };
  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
