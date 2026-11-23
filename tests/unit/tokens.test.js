import { describe, expect, it } from 'vitest';
import {
  hashToken,
  signAccessToken,
  verifyAccessToken,
  buildRefreshTokenRecord,
} from '../../src/utils/tokens.js';

describe('tokens', () => {
  it('signs and verifies access tokens', () => {
    const token = signAccessToken({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      role: 'USER',
    });

    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload.email).toBe('user@example.com');
    expect(payload.typ).toBe('access');
  });

  it('builds hashed refresh token records', () => {
    const { token, record } = buildRefreshTokenRecord('11111111-1111-1111-1111-111111111111', {
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(token.length).toBeGreaterThan(20);
    expect(record.tokenHash).toBe(hashToken(token));
    expect(record.tokenHash).not.toBe(token);
    expect(record.expiresAt).toBeInstanceOf(Date);
  });
});
