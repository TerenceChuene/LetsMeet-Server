import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../../src/modules/auth/validators/authValidators.js';

describe('auth validators', () => {
  it('accepts a valid registration payload', () => {
    const parsed = registerSchema.parse({
      email: 'Alex@Example.com',
      password: 'SecurePass1',
      displayName: 'Alex',
    });
    expect(parsed.email).toBe('alex@example.com');
  });

  it('rejects weak passwords', () => {
    const result = registerSchema.safeParse({
      email: 'alex@example.com',
      password: 'short',
      displayName: 'Alex',
    });
    expect(result.success).toBe(false);
  });

  it('requires login credentials', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success,
    ).toBe(true);
  });

  it('validates reset password payload', () => {
    expect(
      resetPasswordSchema.safeParse({
        token: 'abc',
        password: 'SecurePass1',
      }).success,
    ).toBe(true);
  });
});
