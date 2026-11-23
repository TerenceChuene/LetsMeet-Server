import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import {
  listNotifications,
  markAllRead,
  markRead,
} from '../controllers/notificationController.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate(
    z.object({
      unreadOnly: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
    'query',
  ),
  listNotifications,
);

router.post('/read-all', markAllRead);

router.post(
  '/:id/read',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  markRead,
);

export default router;
