import { prisma } from '../../../database/prisma.js';

const meetingInclude = {
  owner: { include: { profile: true } },
  participants: {
    include: {
      user: { include: { profile: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
};

export async function createMeeting(data) {
  return prisma.meeting.create({
    data,
    include: meetingInclude,
  });
}

export async function findMeetingById(id) {
  return prisma.meeting.findFirst({
    where: { id, deletedAt: null },
    include: meetingInclude,
  });
}

export async function findMeetingByCode(code) {
  return prisma.meeting.findFirst({
    where: { code, deletedAt: null },
    include: meetingInclude,
  });
}

export async function listMeetingsForUser(userId, { status, limit = 20, cursor } = {}) {
  return prisma.meeting.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
      OR: [
        { ownerId: userId },
        {
          participants: {
            some: {
              userId,
              status: { notIn: ['REMOVED', 'REJECTED'] },
            },
          },
        },
      ],
    },
    include: {
      owner: { include: { profile: true } },
      participants: {
        where: { userId },
        take: 1,
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

export async function updateMeeting(id, data) {
  return prisma.meeting.update({
    where: { id },
    data,
    include: meetingInclude,
  });
}

export async function softDeleteMeeting(id) {
  return prisma.meeting.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'CANCELLED',
      endedAt: new Date(),
    },
    include: meetingInclude,
  });
}

export async function countActiveParticipants(meetingId) {
  return prisma.meetingParticipant.count({
    where: {
      meetingId,
      status: { in: ['WAITING', 'ADMITTED', 'JOINED'] },
    },
  });
}

export async function codeExists(code) {
  const existing = await prisma.meeting.findUnique({
    where: { code },
    select: { id: true },
  });
  return Boolean(existing);
}
