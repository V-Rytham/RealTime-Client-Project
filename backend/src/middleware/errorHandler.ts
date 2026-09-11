import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/errors';
import { env } from '../config/env';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
  const message = err instanceof HttpError ? err.message : 'Something went wrong';
  if (env.nodeEnv !== 'test') console.error('[api]', code, message, err?.details ?? '');
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err instanceof HttpError && err.details ? { details: err.details } : {}),
    },
  });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}
