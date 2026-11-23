import { prisma } from '../../../database/prisma.js';

export async function findUserByEmail(email) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    include: { profile: true, settings: true },
  });
}

export async function findUserById(id) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { profile: true, settings: true },
  });
}

export async function createUserWithProfile({
  email,
  passwordHash,
  displayName,
  status = 'PENDING_VERIFICATION',
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        status,
        profile: {
          create: {
            displayName,
          },
        },
        settings: {
          create: {},
        },
      },
      include: {
        profile: true,
        settings: true,
      },
    });
    return user;
  });
}

export async function updateUserPassword(userId, passwordHash) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function markEmailVerified(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    include: { profile: true, settings: true },
  });
}

export async function touchLogin(userId) {
  const now = new Date();
  return prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: now,
      lastSeenAt: now,
    },
  });
}

export async function updateLastSeen(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });
}
