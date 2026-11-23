import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { connectRedis, disconnectRedis } from './infrastructure/redis/client.js';
import { logger } from './infrastructure/logging/logger.js';
import { closeSocketServer, createSocketServer } from './sockets/index.js';

async function bootstrap() {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = await createSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        url: env.APP_URL,
        socketPath: '/socket.io',
      },
      `${env.APP_NAME} listening`,
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    httpServer.close(async () => {
      try {
        await closeSocketServer(io);
        await disconnectRedis();
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
