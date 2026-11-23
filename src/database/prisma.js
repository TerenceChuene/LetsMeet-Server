import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logging/logger.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.isDevelopment
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

if (env.isDevelopment && !globalForPrisma.prisma) {
  prisma.$on('query', (event) => {
    logger.debug(
      { query: event.query, params: event.params, durationMs: event.duration },
      'prisma.query',
    );
  });
}

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  await prisma.$connect();
  logger.info('PostgreSQL connected');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}

export async function checkDatabaseHealth() {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return {
    status: 'up',
    latencyMs: Date.now() - started,
  };
}

export default prisma;
