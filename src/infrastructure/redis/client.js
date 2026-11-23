import Redis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

let redis = null;

export function getRedis() {
  if (redis) {
    return redis;
  }

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    logger.info('Redis connecting');
  });

  redis.on('ready', () => {
    logger.info('Redis ready');
  });

  redis.on('error', (error) => {
    logger.error({ err: error }, 'Redis error');
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redis;
}

export async function connectRedis() {
  const client = getRedis();
  if (client.status === 'wait') {
    await client.connect();
  }
  await client.ping();
  logger.info('Redis connected');
  return client;
}

export async function disconnectRedis() {
  if (!redis) {
    return;
  }
  await redis.quit();
  redis = null;
  logger.info('Redis disconnected');
}

export async function checkRedisHealth() {
  const client = getRedis();
  const started = Date.now();

  if (client.status === 'wait') {
    await client.connect();
  }

  const pong = await client.ping();
  return {
    status: pong === 'PONG' ? 'up' : 'degraded',
    latencyMs: Date.now() - started,
  };
}

export default getRedis;
