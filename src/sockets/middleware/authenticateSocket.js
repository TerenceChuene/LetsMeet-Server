import { prisma } from '../../database/prisma.js';
import { verifyAccessToken } from '../../utils/tokens.js';
import { logger } from '../../infrastructure/logging/logger.js';

function extractToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
}

export async function authenticateSocket(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(new Error('INVALID_TOKEN'));
    }

    if (payload.typ !== 'access' || !payload.sub) {
      return next(new Error('INVALID_TOKEN'));
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: { profile: true, settings: true },
    });

    if (!user) {
      return next(new Error('UNAUTHORIZED'));
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      return next(new Error('ACCOUNT_DISABLED'));
    }

    socket.data.user = user;
    socket.data.auth = {
      userId: user.id,
      role: user.globalRole,
    };

    return next();
  } catch (error) {
    logger.error({ err: error }, 'socket.auth_failed');
    return next(new Error('UNAUTHORIZED'));
  }
}

export default authenticateSocket;
