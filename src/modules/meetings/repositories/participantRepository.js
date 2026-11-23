import { prisma } from '../../../database/prisma.js';

const participantInclude = {
  user: { include: { profile: true } },
  meeting: true,
};

export async function createParticipant(data) {
  return prisma.meetingParticipant.create({
    data,
    include: participantInclude,
  });
}

export async function upsertParticipant(meetingId, userId, data) {
  return prisma.meetingParticipant.upsert({
    where: {
      meetingId_userId: { meetingId, userId },
    },
    create: {
      meetingId,
      userId,
      ...data,
    },
    update: data,
    include: participantInclude,
  });
}

export async function findParticipant(meetingId, userId) {
  return prisma.meetingParticipant.findUnique({
    where: {
      meetingId_userId: { meetingId, userId },
    },
    include: participantInclude,
  });
}

export async function listParticipants(meetingId, { status } = {}) {
  return prisma.meetingParticipant.findMany({
    where: {
      meetingId,
      ...(status ? { status } : {}),
    },
    include: {
      user: { include: { profile: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function updateParticipant(meetingId, userId, data) {
  return prisma.meetingParticipant.update({
    where: {
      meetingId_userId: { meetingId, userId },
    },
    data,
    include: participantInclude,
  });
}

export async function markAllJoinedAsLeft(meetingId) {
  return prisma.meetingParticipant.updateMany({
    where: {
      meetingId,
      status: { in: ['WAITING', 'ADMITTED', 'JOINED'] },
    },
    data: {
      status: 'LEFT',
      leftAt: new Date(),
      micEnabled: false,
      cameraEnabled: false,
      screenSharing: false,
      handRaised: false,
    },
  });
}
