import { prisma } from '../../../database/prisma.js';

export async function findById(id) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { profile: true, settings: true },
  });
}

export async function updateProfileAndSettings(userId, { profile, settings }) {
  return prisma.$transaction(async (tx) => {
    if (profile && Object.keys(profile).length > 0) {
      await tx.userProfile.update({
        where: { userId },
        data: profile,
      });
    }

    if (settings && Object.keys(settings).length > 0) {
      await tx.userSettings.update({
        where: { userId },
        data: settings,
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });

    return tx.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true },
    });
  });
}

export async function searchUsers({ query, limit = 20 }) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] },
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { profile: { displayName: { contains: query, mode: 'insensitive' } } },
      ],
    },
    include: { profile: true },
    take: Math.min(limit, 50),
    orderBy: { createdAt: 'desc' },
  });
}
