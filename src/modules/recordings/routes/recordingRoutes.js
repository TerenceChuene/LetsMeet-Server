import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import { z } from 'zod';
import {
  getRecordingDownload,
  listRecordings,
} from '../controllers/recordingController.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate(
    z.object({
      meetingId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
    'query',
  ),
  listRecordings,
);

router.get(
  '/:id/download',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  getRecordingDownload,
);

export default router;
