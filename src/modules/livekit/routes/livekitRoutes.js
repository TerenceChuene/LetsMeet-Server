import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import { createToken } from '../controllers/livekitController.js';
import { livekitTokenSchema } from '../validators/livekitValidators.js';

const router = Router();

router.post('/token', authenticate, validate(livekitTokenSchema), createToken);

export default router;
