import { env } from '../../../config/env.js';
import { parseDurationToMs } from '../../../utils/crypto.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN),
  };
}

export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...refreshCookieOptions(),
    maxAge: 0,
  });
}

export function readRefreshToken(req) {
  return req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME] || null;
}
