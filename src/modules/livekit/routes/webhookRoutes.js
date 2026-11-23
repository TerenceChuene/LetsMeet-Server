import { Router } from 'express';
import { handleWebhook } from '../controllers/livekitController.js';

const router = Router();

router.post('/livekit', handleWebhook);

export default router;
