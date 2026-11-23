import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logging/logger.js';
import { authenticateSocket } from './middleware/authenticateSocket.js';
import { createEventRateLimiter } from './middleware/eventRateLimit.js';
import { registerHandlers } from './handlers/registerHandlers.js';
import { setIO } from './io.js';

let adapterPubClient;
let adapterSubClient;

export async function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  try {
    adapterPubClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    adapterSubClient = adapterPubClient.duplicate();

    adapterPubClient.on('error', (error) => {
      logger.error({ err: error }, 'socket.redis_pub_error');
    });
    adapterSubClient.on('error', (error) => {
      logger.error({ err: error }, 'socket.redis_sub_error');
    });

    io.adapter(createAdapter(adapterPubClient, adapterSubClient));
    logger.info('Socket.IO Redis adapter attached');
  } catch (error) {
    logger.error({ err: error }, 'socket.redis_adapter_failed');
    throw error;
  }

  io.use(authenticateSocket);

  const rateLimit = createEventRateLimiter({ limit: 60, windowMs: 10_000 });

  io.on('connection', (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.user?.id },
      'socket.connected',
    );

    socket.use((packet, next) => rateLimit(socket, next));
    registerHandlers(io, socket);

    socket.emit('connected', {
      userId: socket.data.user.id,
      socketId: socket.id,
      // Explicit reminder for clients: media uses LiveKit, not this socket.
      mediaTransport: 'livekit',
      signallingOnly: true,
    });
  });

  io.engine.on('connection_error', (error) => {
    logger.warn({ err: error }, 'socket.engine_connection_error');
  });

  setIO(io);
  return io;
}

export async function closeSocketServer(io) {
  if (io) {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });
  }

  if (adapterPubClient) {
    adapterPubClient.disconnect();
    adapterPubClient = undefined;
  }
  if (adapterSubClient) {
    adapterSubClient.disconnect();
    adapterSubClient = undefined;
  }

  setIO(null);
}

export default createSocketServer;
