import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function useSocket(onEvent?: (socket: Socket) => void): React.RefObject<Socket | null> {
  const ref = useRef<Socket | null>(null);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const s = io(URL, { auth: { token }, withCredentials: true });
    ref.current = s;
    if (onEvent) onEvent(s);
    return () => {
      s.disconnect();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} mins ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hours ago`;
  return `${Math.floor(h / 24)} days ago`;
}
