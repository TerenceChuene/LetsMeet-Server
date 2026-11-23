import { Router } from 'express';
import authRoutes from '../../modules/auth/routes/authRoutes.js';
import meetingsRoutes from '../../modules/meetings/routes/meetingsRoutes.js';
import userRoutes from '../../modules/users/routes/userRoutes.js';
import livekitRoutes from '../../modules/livekit/routes/livekitRoutes.js';
import webhookRoutes from '../../modules/livekit/routes/webhookRoutes.js';
import recordingRoutes from '../../modules/recordings/routes/recordingRoutes.js';
import notificationRoutes from '../../modules/notifications/routes/notificationRoutes.js';
import adminRoutes from '../../modules/admin/routes/adminRoutes.js';

/**
 * Versioned API router. Domain routes are mounted as phases land.
 */
export function createApiV1Router() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      version: 'v1',
      endpoints: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        meetings: '/api/v1/meetings',
        recordings: '/api/v1/recordings',
        notifications: '/api/v1/notifications',
        admin: '/api/v1/admin',
        livekit: '/api/v1/livekit',
        webhooks: '/api/v1/webhooks',
        docs: '/api/docs',
        health: '/health',
      },
    });
  });

  router.use('/auth', authRoutes);
  router.use('/users', userRoutes);
  router.use('/meetings', meetingsRoutes);
  router.use('/recordings', recordingRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/admin', adminRoutes);
  router.use('/livekit', livekitRoutes);
  router.use('/webhooks', webhookRoutes);

  return router;
}

export default createApiV1Router;
