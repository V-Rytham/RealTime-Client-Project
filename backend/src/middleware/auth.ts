import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { HttpError, type AuthUser, type Role } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHORIZED', 'Missing access token');
    const token = header.slice(7);
    req.user = verifyAccessToken(token);
    next();
  } catch (e: any) {
    if (e instanceof HttpError) return next(e);
    return next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired access token'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED', 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', `Requires role: ${roles.join(', ')}`));
    }
    next();
  };
}
