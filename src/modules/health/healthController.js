import { checkDatabaseHealth } from '../../database/prisma.js';
import { checkRedisHealth } from '../../infrastructure/redis/client.js';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { checkLiveKitHealth } from '../livekit/services/roomService.js';
import { isLiveKitConfigured } from '../livekit/config.js';
import {
  checkStorageHealth,
  isStorageConfigured,
} from '../../infrastructure/storage/azureBlob.js';

async function probe(name, checker) {
  try {
    const result = await checker();
    return { name, ...result };
  } catch (error) {
    return {
      name,
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const getHealth = asyncHandler(async (_req, res) => {
  const checksList = [
    probe('postgres', checkDatabaseHealth),
    probe('redis', checkRedisHealth),
  ];

  if (isLiveKitConfigured()) {
    checksList.push(probe('livekit', checkLiveKitHealth));
  }
  if (isStorageConfigured()) {
    checksList.push(probe('storage', checkStorageHealth));
  }

  const results = await Promise.all(checksList);
  const checks = Object.fromEntries(results.map((item) => [item.name, item]));

  const required = ['postgres', 'redis'];
  const healthy = required.every((name) => checks[name]?.status === 'up');
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    service: env.APP_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  });
});

export const getLiveness = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export const getReadiness = asyncHandler(async (_req, res) => {
  const [database, redis] = await Promise.all([
    probe('postgres', checkDatabaseHealth),
    probe('redis', checkRedisHealth),
  ]);

  const ready = database.status === 'up' && redis.status === 'up';

  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    checks: { database, redis },
    timestamp: new Date().toISOString(),
  });
});
