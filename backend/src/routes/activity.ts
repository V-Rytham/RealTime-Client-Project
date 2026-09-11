import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { listActivityFor } from '../services/activityService';

const router = Router();
router.use(requireAuth);

const q = z.object({
  projectId: z.coerce.number().int().optional(),
  taskId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/activity?projectId=&taskId=&limit=20
// Offline catchup: client fetches last 20 from DB (not memory) after reconnect.
router.get('/', validateQuery(q), async (req: any, res, next) => {
  try {
    const rows = await listActivityFor(req.user!, {
      projectId: req.query.projectId,
      taskId: req.query.taskId,
      limit: req.query.limit,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

export default router;
