import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './modules/health/healthRoutes.js';
import { createApiV1Router } from './routes/v1/index.js';
import { mountSwagger } from './docs/swagger.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId ?? randomUUID(),
      customProps: (req) => ({ requestId: req.requestId }),
      autoLogging: {
        ignore: (req) => req.url === '/health/live',
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      },
    }),
  );

  // Preserve raw body for LiveKit webhook signature verification.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        if (req.originalUrl?.startsWith('/api/v1/webhooks/livekit')) {
          req.rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      service: env.APP_NAME,
      version: '1.0.0',
      api: '/api/v1',
      health: '/health',
      docs: '/api/docs',
    });
  });

  mountSwagger(app);

  app.use('/health', healthRoutes);
  app.use('/api/v1', createApiV1Router());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
