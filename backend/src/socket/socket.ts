import type { Server } from 'socket.io';
import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../utils/jwt';
import { queryOne } from '../config/db';
import { env } from '../config/env';

let io: SocketServer | null = null;
// userId -> active socket count (presence)
const presence = new Map<number, number>();

export function getIO(): SocketServer | null {
  return io;
}

export function getOnlineCount(): number {
  return presence.size;
}

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: [env.frontendUrl], credentials: true },
  });

  // Auth every socket connection with the access JWT (same secret as REST)
  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.query?.token as string);
      if (!token) return next(new Error('unauthorized'));
      const user = verifyAccessToken(token);
      (socket.data as any).user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as any).user as { id: number; role: string; name: string };
    presence.set(user.id, (presence.get(user.id) ?? 0) + 1);
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    // Admin live presence count
    io!.emit('presence:update', { onlineCount: presence.size });

    socket.on('project:join', async (projectId: number, ack?: (ok: boolean) => void) => {
      // Authorize room join with the same rules as the REST layer
      const allowed = await canViewProject(user.id, user.role, Number(projectId));
      if (allowed) {
        socket.join(`project:${projectId}`);
        ack?.(true);
      } else {
        ack?.(false);
      }
    });

    socket.on('project:leave', (projectId: number) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      const n = (presence.get(user.id) ?? 1) - 1;
      if (n <= 0) presence.delete(user.id);
      else presence.set(user.id, n);
      io!.emit('presence:update', { onlineCount: presence.size });
    });
  });

  return io;
}

async function canViewProject(userId: number, role: string, projectId: number): Promise<boolean> {
  if (!projectId) return false;
  if (role === 'ADMIN') return true;
  if (role === 'PM') {
    const r = await queryOne(`SELECT id FROM projects WHERE id=$1 AND created_by=$2`, [projectId, userId]);
    return !!r;
  }
  const r = await queryOne(`SELECT t.id FROM tasks t WHERE t.project_id=$1 AND t.assigned_to=$2 LIMIT 1`, [projectId, userId]);
  return !!r;
}

export function emitActivity(activity: any, projectId: number | null) {
  if (!io) return;
  // Project room gets it instantly; global feed clients filter by role client-side
  // AND refetch via REST for strict server-side role filtering. Server also emits
  // targeted copies: to PM owner room and assignee room via notification path elsewhere.
  if (projectId) io.to(`project:${projectId}`).emit('activity:new', activity);
  io.to('role:ADMIN').emit('activity:new', activity);
}
