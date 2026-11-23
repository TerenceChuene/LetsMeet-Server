import { Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import { generateOpaqueToken } from '../../../utils/crypto.js';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import {
  buildRefreshTokenRecord,
  getAccessTokenExpiresInSeconds,
  hashToken,
  rotateRefreshTokenRecord,
  signAccessToken,
} from '../../../utils/tokens.js';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
} from '../../../infrastructure/email/emailService.js';
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  storeEmailVerificationToken,
  storePasswordResetToken,
} from '../../../infrastructure/redis/tokenStore.js';
import { writeAuditLog } from '../repositories/auditRepository.js';
import * as userRepo from '../repositories/userRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import { serializeUser } from '../serializers/userSerializer.js';

function clientMeta(context = {}) {
  return {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  };
}

function assertAccountUsable(user) {
  if (!user || user.deletedAt) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError('Account is suspended', 403, { code: 'ACCOUNT_SUSPENDED' });
  }
  if (user.status === 'DEACTIVATED') {
    throw new AppError('Account is deactivated', 403, { code: 'ACCOUNT_DEACTIVATED' });
  }
}

async function issueSessionTokens(user, context = {}) {
  const meta = clientMeta(context);
  const { token: refreshToken, record } = buildRefreshTokenRecord(user.id, meta);
  const storedRefresh = await tokenRepo.createRefreshToken(record);

  const session = await tokenRepo.createSession({
    userId: user.id,
    deviceName: context.deviceName ?? null,
    deviceId: context.deviceId ?? null,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: record.expiresAt,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.globalRole,
  });

  await userRepo.touchLogin(user.id);

  return {
    user: serializeUser(user, { includeSettings: true }),
    accessToken,
    refreshToken,
    expiresIn: getAccessTokenExpiresInSeconds(),
    tokenType: 'Bearer',
    sessionId: session.id,
    refreshTokenId: storedRefresh.id,
  };
}

export async function register({ email, password, displayName }, context = {}) {
  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await userRepo.createUserWithProfile({
      email,
      passwordHash,
      displayName,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('Email is already registered', 409, { code: 'EMAIL_TAKEN' });
    }
    throw error;
  }

  const verificationToken = generateOpaqueToken(32);
  await storeEmailVerificationToken(verificationToken, user.id);
  const verifyUrl = `${env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;
  await sendEmailVerification(user.email, verifyUrl);

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.register',
    resource: 'user',
    resourceId: user.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  const tokens = await issueSessionTokens(user, context);

  return {
    ...tokens,
    verificationRequired: true,
    // Returned only outside production so local/dev can verify without inbox.
    ...(env.isProduction ? {} : { verificationToken }),
  };
}

export async function login({ email, password }, context = {}) {
  const user = await userRepo.findUserByEmail(email);
  assertAccountUsable(user);

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.login',
    resource: 'user',
    resourceId: user.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return issueSessionTokens(user, context);
}

export async function refresh(rawRefreshToken, context = {}) {
  if (!rawRefreshToken) {
    throw new AppError('Refresh token is required', 400, { code: 'REFRESH_TOKEN_REQUIRED' });
  }

  const existing = await tokenRepo.findRefreshTokenByHash(hashToken(rawRefreshToken));
  if (!existing) {
    throw new AppError('Invalid refresh token', 401, { code: 'INVALID_REFRESH_TOKEN' });
  }

  if (existing.revokedAt) {
    await tokenRepo.revokeRefreshTokenFamily(existing.familyId);
    throw new AppError('Refresh token reuse detected', 401, {
      code: 'REFRESH_TOKEN_REUSE',
    });
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError('Refresh token expired', 401, { code: 'REFRESH_TOKEN_EXPIRED' });
  }

  assertAccountUsable(existing.user);

  const { token: nextRefreshToken, record } = rotateRefreshTokenRecord(existing, clientMeta(context));
  const created = await tokenRepo.createRefreshToken(record);
  await tokenRepo.revokeRefreshToken(existing.id, created.id);

  const accessToken = signAccessToken({
    sub: existing.user.id,
    email: existing.user.email,
    role: existing.user.globalRole,
  });

  await userRepo.updateLastSeen(existing.user.id);

  return {
    user: serializeUser(existing.user, { includeSettings: true }),
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn: getAccessTokenExpiresInSeconds(),
    tokenType: 'Bearer',
  };
}

export async function logout(rawRefreshToken, context = {}) {
  if (rawRefreshToken) {
    const existing = await tokenRepo.findRefreshTokenByHash(hashToken(rawRefreshToken));
    if (existing && !existing.revokedAt) {
      await tokenRepo.revokeRefreshToken(existing.id);
      await writeAuditLog({
        actorId: existing.userId,
        action: 'auth.logout',
        resource: 'user',
        resourceId: existing.userId,
        ipAddress: context.ip,
        userAgent: context.userAgent,
      });
    }
  }

  return { success: true };
}

export async function forgotPassword({ email }, context = {}) {
  const user = await userRepo.findUserByEmail(email);

  // Always succeed to avoid account enumeration.
  if (user && user.status !== 'DEACTIVATED') {
    const resetToken = generateOpaqueToken(32);
    await storePasswordResetToken(resetToken, user.id);
    const resetUrl = `${env.APP_URL}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    await writeAuditLog({
      actorId: user.id,
      action: 'auth.forgot_password',
      resource: 'user',
      resourceId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    if (!env.isProduction) {
      return {
        success: true,
        message: 'If that email exists, a reset link has been sent',
        resetToken,
      };
    }
  }

  return {
    success: true,
    message: 'If that email exists, a reset link has been sent',
  };
}

export async function resetPassword({ token, password }, context = {}) {
  const payload = await consumePasswordResetToken(token);
  if (!payload?.userId) {
    throw new AppError('Invalid or expired reset token', 400, {
      code: 'INVALID_RESET_TOKEN',
    });
  }

  const user = await userRepo.findUserById(payload.userId);
  assertAccountUsable(user);

  const passwordHash = await hashPassword(password);
  await userRepo.updateUserPassword(user.id, passwordHash);
  await tokenRepo.revokeAllUserRefreshTokens(user.id);
  await tokenRepo.revokeAllUserSessions(user.id);

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.reset_password',
    resource: 'user',
    resourceId: user.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return { success: true, message: 'Password updated successfully' };
}

export async function verifyEmail({ token }, context = {}) {
  const payload = await consumeEmailVerificationToken(token);
  if (!payload?.userId) {
    throw new AppError('Invalid or expired verification token', 400, {
      code: 'INVALID_VERIFICATION_TOKEN',
    });
  }

  const user = await userRepo.markEmailVerified(payload.userId);

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.verify_email',
    resource: 'user',
    resourceId: user.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return {
    success: true,
    user: serializeUser(user, { includeSettings: true }),
  };
}

export async function deactivateAccount(userId, context = {}) {
  const { prisma } = await import('../../../database/prisma.js');
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'DEACTIVATED',
      deletedAt: new Date(),
    },
  });
  await tokenRepo.revokeAllUserRefreshTokens(userId);
  await tokenRepo.revokeAllUserSessions(userId);

  await writeAuditLog({
    actorId: userId,
    action: 'auth.deactivate',
    resource: 'user',
    resourceId: userId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return { success: true };
}
