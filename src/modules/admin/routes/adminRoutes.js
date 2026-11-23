import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireMinRole } from '../../../middleware/authorize.js';
import { validate } from '../../../middleware/validate.js';
import {
  activateUser,
  forceEndMeeting,
  getDashboard,
  getSystemHealth,
  getUser,
  listAuditLogs,
  listMeetings,
  listUsers,
  suspendUser,
  updateUserRole,
} from '../controllers/adminController.js';

const router = Router();

router.use(authenticate, requireMinRole('ADMIN'));

router.get('/dashboard', getDashboard);
router.get('/system/health', getSystemHealth);

router.get(
  '/users',
  validate(
    z.object({
      q: z.string().trim().min(1).optional(),
      status: z
        .enum(['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DEACTIVATED'])
        .optional(),
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().uuid().optional(),
    }),
    'query',
  ),
  listUsers,
);

router.get(
  '/users/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  getUser,
);

router.post(
  '/users/:id/suspend',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(
    z.object({
      reason: z.string().trim().max(500).optional(),
    }),
  ),
  suspendUser,
);

router.post(
  '/users/:id/activate',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  activateUser,
);

router.patch(
  '/users/:id/role',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(
    z.object({
      globalRole: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']),
    }),
  ),
  updateUserRole,
);

router.get(
  '/meetings',
  validate(
    z.object({
      q: z.string().trim().min(1).optional(),
      status: z
        .enum(['SCHEDULED', 'WAITING', 'LIVE', 'ENDED', 'CANCELLED', 'EXPIRED'])
        .optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().uuid().optional(),
    }),
    'query',
  ),
  listMeetings,
);

router.post(
  '/meetings/:id/end',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  forceEndMeeting,
);

router.get(
  '/audit-logs',
  validate(
    z.object({
      actorId: z.string().uuid().optional(),
      resource: z.string().trim().min(1).optional(),
      action: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().uuid().optional(),
    }),
    'query',
  ),
  listAuditLogs,
);

export default router;
