import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import {
  getMe,
  getUserById,
  searchUsers,
  updateMe,
} from '../controllers/userController.js';
import { updateMeSchema, userIdParamSchema } from '../validators/userValidators.js';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validate(updateMeSchema), updateMe);
router.get('/search', authenticate, searchUsers);
router.get(
  '/:id',
  optionalAuthenticate,
  validate(userIdParamSchema, 'params'),
  getUserById,
);

export default router;
