import { AppError } from '../utils/AppError.js';

const ROLE_RANK = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Require one of the listed global roles.
 * @param {...('USER'|'ADMIN'|'SUPER_ADMIN')} roles
 */
export function requireRoles(...roles) {
  const allowed = new Set(roles);

  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' }));
    }

    if (!allowed.has(req.user.globalRole)) {
      return next(
        new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' }),
      );
    }

    return next();
  };
}

/**
 * Require at least the given role level (USER < ADMIN < SUPER_ADMIN).
 * @param {'USER'|'ADMIN'|'SUPER_ADMIN'} minimumRole
 */
export function requireMinRole(minimumRole) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' }));
    }

    const userRank = ROLE_RANK[req.user.globalRole] ?? 0;
    const requiredRank = ROLE_RANK[minimumRole] ?? Number.MAX_SAFE_INTEGER;

    if (userRank < requiredRank) {
      return next(
        new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' }),
      );
    }

    return next();
  };
}

export default requireRoles;
