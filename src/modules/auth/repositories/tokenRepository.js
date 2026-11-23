import { prisma } from '../../../database/prisma.js';

export async function createRefreshToken(data) {
  return prisma.refreshToken.create({ data });
}

export async function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { profile: true, settings: true },
      },
    },
  });
}

export async function revokeRefreshToken(id, replacedById = null) {
  return prisma.refreshToken.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      replacedById,
    },
  });
}

export async function revokeRefreshTokenFamily(familyId) {
  return prisma.refreshToken.updateMany({
    where: {
      familyId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function revokeAllUserRefreshTokens(userId) {
  return prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function createSession(data) {
  return prisma.userSession.create({ data });
}

export async function revokeSession(id) {
  return prisma.userSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId) {
  return prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function touchSession(id) {
  return prisma.userSession.update({
    where: { id },
    data: { lastActiveAt: new Date() },
  });
}
