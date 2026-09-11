import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import type { AuthUser } from './errors';

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpiresIn } as any
  );
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: `${env.jwtRefreshExpiresDays}d`,
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const p = jwt.verify(token, env.jwtAccessSecret) as any;
  return { id: Number(p.sub), email: p.email, role: p.role, name: p.name };
}

export function verifyRefreshToken(token: string): number {
  const p = jwt.verify(token, env.jwtRefreshSecret) as any;
  return Number(p.sub);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
