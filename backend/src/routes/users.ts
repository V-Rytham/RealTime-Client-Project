import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../utils/errors';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    const rows = await query(`SELECT id, name, email, role, created_at FROM users ORDER BY id`);
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['ADMIN', 'PM', 'DEVELOPER']),
});

router.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await queryOne(`SELECT id FROM users WHERE email=$1`, [email]);
    if (existing) throw new HttpError(409, 'CONFLICT', 'Email already exists');
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

router.delete('/:id', async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user!.id) throw new HttpError(400, 'BAD_REQUEST', 'Cannot delete yourself');
    await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Deleted' } });
  } catch (e) {
    next(e);
  }
});

export default router;
