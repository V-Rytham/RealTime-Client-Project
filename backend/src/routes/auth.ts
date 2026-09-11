import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../utils/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/jwt';
import { env } from '../config/env';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['ADMIN', 'PM', 'DEVELOPER']).default('DEVELOPER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: env.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000,
  };
}

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await queryOne(`SELECT id FROM users WHERE email=$1`, [email]);
    if (existing) throw new HttpError(409, 'CONFLICT', 'Email already registered');
    const hash = await bcrypt.hash(password, 10);
    const user = await queryOne(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at`,
      [name, email, hash, role]
    );
    res.status(201).json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const row: any = await queryOne(`SELECT * FROM users WHERE email=$1`, [email]);
    if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user.id);
    const expiresAt = new Date(Date.now() + env.jwtRefreshExpiresDays * 86400000).toISOString();
    await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
      user.id,
      hashToken(refreshToken),
      expiresAt,
    ]);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions());
    res.json({ success: true, data: { user, accessToken } });
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Missing refresh token');
    const userId = verifyRefreshToken(token);
    const stored: any = await queryOne(`SELECT * FROM refresh_tokens WHERE token_hash=$1`, [hashToken(token)]);
    if (!stored) throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token revoked');
    if (new Date(stored.expires_at) < new Date()) throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token expired');
    const row: any = await queryOne(`SELECT id, name, email, role FROM users WHERE id=$1`, [userId]);
    if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'User not found');
    // rotate
    await query(`DELETE FROM refresh_tokens WHERE token_hash=$1`, [hashToken(token)]);
    const accessToken = signAccessToken(row);
    const newRefresh = signRefreshToken(row.id);
    const expiresAt = new Date(Date.now() + env.jwtRefreshExpiresDays * 86400000).toISOString();
    await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
      row.id,
      hashToken(newRefresh),
      expiresAt,
    ]);
    res.cookie('refreshToken', newRefresh, refreshCookieOptions());
    res.json({ success: true, data: { user: row, accessToken } });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (token) await query(`DELETE FROM refresh_tokens WHERE token_hash=$1`, [hashToken(token)]);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const row = await queryOne(`SELECT id, name, email, role, created_at FROM users WHERE id=$1`, [req.user!.id]);
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

export default router;
