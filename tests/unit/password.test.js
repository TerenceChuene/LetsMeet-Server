import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password with argon2', async () => {
    const hash = await hashPassword('SecurePass1');
    expect(hash).not.toContain('SecurePass1');
    expect(await verifyPassword(hash, 'SecurePass1')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPass1')).toBe(false);
  });
});
