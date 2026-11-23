import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { addDuration, generateOpaqueToken, newUuid, sha256 } from './crypto.js';

export function signAccessToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      typ: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: env.APP_NAME,
      audience: env.APP_URL,
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.APP_NAME,
    audience: env.APP_URL,
  });
}

export function createRefreshTokenValue() {
  return generateOpaqueToken(48);
}

export function hashToken(token) {
  // Pepper with refresh secret so DB token hashes alone are insufficient if leaked.
  return sha256(`${env.JWT_REFRESH_SECRET}:${token}`);
}

export function buildRefreshTokenRecord(userId, { ip, userAgent } = {}) {
  const token = createRefreshTokenValue();
  const familyId = newUuid();
  const expiresAt = addDuration(new Date(), env.JWT_REFRESH_EXPIRES_IN);

  return {
    token,
    record: {
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt,
      createdByIp: ip ?? null,
      userAgent: userAgent ?? null,
    },
  };
}

export function rotateRefreshTokenRecord(existing, { ip, userAgent } = {}) {
  const token = createRefreshTokenValue();
  const expiresAt = addDuration(new Date(), env.JWT_REFRESH_EXPIRES_IN);

  return {
    token,
    record: {
      userId: existing.userId,
      tokenHash: hashToken(token),
      familyId: existing.familyId,
      expiresAt,
      createdByIp: ip ?? existing.createdByIp ?? null,
      userAgent: userAgent ?? existing.userAgent ?? null,
    },
  };
}

export function getAccessTokenExpiresInSeconds() {
  const match = /^(\d+)(s|m|h|d)$/.exec(env.JWT_ACCESS_EXPIRES_IN);
  if (!match) return 900;
  const amount = Number(match[1]);
  const unit = match[2];
  const map = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * map[unit];
}
