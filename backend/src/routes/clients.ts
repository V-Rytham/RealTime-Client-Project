import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../utils/errors';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (req.user!.role === 'DEVELOPER') throw new HttpError(403, 'FORBIDDEN', 'Developers cannot view clients');
    const rows = await query(`SELECT c.*, u.name AS created_by_name FROM clients c LEFT JOIN users u ON u.id=c.created_by ORDER BY c.id DESC`);
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({ name: z.string().min(2).max(150), contact_email: z.string().email().optional().nullable() });

router.post('/', requireRole('ADMIN', 'PM'), validateBody(createSchema), async (req, res, next) => {
  try {
    const row = await queryOne(`INSERT INTO clients (name, contact_email, created_by) VALUES ($1,$2,$3) RETURNING *`, [
      req.body.name,
      req.body.contact_email ?? null,
      req.user!.id,
    ]);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await query(`DELETE FROM clients WHERE id=$1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Deleted' } });
  } catch (e) {
    next(e);
  }
});

export default router;
