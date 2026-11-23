import { describe, expect, it } from 'vitest';
import { requireMinRole, requireRoles } from '../../src/middleware/authorize.js';
import { AppError } from '../../src/utils/AppError.js';

function run(middleware, user) {
  return new Promise((resolve) => {
    const req = { user };
    middleware(req, {}, (err) => resolve(err));
  });
}

describe('admin authorization middleware', () => {
  it('allows admins for requireMinRole(ADMIN)', async () => {
    const err = await run(requireMinRole('ADMIN'), { globalRole: 'ADMIN' });
    expect(err).toBeUndefined();
  });

  it('blocks users for requireMinRole(ADMIN)', async () => {
    const err = await run(requireMinRole('ADMIN'), { globalRole: 'USER' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('allows SUPER_ADMIN for requireRoles(ADMIN, SUPER_ADMIN)', async () => {
    const err = await run(requireRoles('ADMIN', 'SUPER_ADMIN'), {
      globalRole: 'SUPER_ADMIN',
    });
    expect(err).toBeUndefined();
  });

  it('requires authentication', async () => {
    const err = await run(requireMinRole('ADMIN'), undefined);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });
});
