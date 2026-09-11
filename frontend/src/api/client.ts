import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL, withCredentials: true });

// Access token kept in memory only (never localStorage). Refresh token is HttpOnly cookie.
let accessToken: string | null = null;
export function setAccessToken(t: string | null) {
  accessToken = t;
}
export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

// Single-flight refresh on 401
let refreshing: Promise<string> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig: any = err.config;
    if (err.response?.status === 401 && !orig._retried) {
      orig._retried = true;
      try {
        refreshing = refreshing ?? axios.post(`${baseURL}/api/auth/refresh`, {}, { withCredentials: true }).then((r) => r.data.data.accessToken as string);
        const t = await refreshing;
        refreshing = null;
        setAccessToken(t);
        orig.headers.Authorization = `Bearer ${t}`;
        return api(orig);
      } catch (e) {
        refreshing = null;
        throw e;
      }
    }
    throw err;
  }
);
