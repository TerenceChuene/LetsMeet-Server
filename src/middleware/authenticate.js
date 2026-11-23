import { prisma } from '../database/prisma.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from './asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError('Invalid or expired access token', 401, {
      code: 'INVALID_TOKEN',
    });
  }

  if (payload.typ !== 'access' || !payload.sub) {
    throw new AppError('Invalid access token', 401, { code: 'INVALID_TOKEN' });
  }

  const user = await prisma.user.findFirst({
    where: {
      id: payload.sub,
      deletedAt: null,
    },
    include: {
      profile: true,
      settings: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.status === 'SUSPENDED') {
    throw new AppError('Account is suspended', 403, { code: 'ACCOUNT_SUSPENDED' });
  }

  if (user.status === 'DEACTIVATED') {
    throw new AppError('Account is deactivated', 403, { code: 'ACCOUNT_DEACTIVATED' });
  }

  req.user = user;
  req.auth = {
    userId: user.id,
    role: user.globalRole,
    tokenPayload: payload,
  };

  next();
});

export const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.typ === 'access' && payload.sub) {
      const user = await prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        include: { profile: true, settings: true },
      });
      if (user && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED') {
        req.user = user;
        req.auth = {
          userId: user.id,
          role: user.globalRole,
          tokenPayload: payload,
        };
      }
    }
  } catch {
    // Optional auth ignores invalid tokens
  }

  next();
});

export default authenticate;
