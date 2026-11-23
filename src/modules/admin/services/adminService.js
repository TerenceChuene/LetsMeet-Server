import { prisma } from '../../../database/prisma.js';
import { AppError } from '../../../utils/AppError.js';
import { env } from '../../../config/env.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';
import { checkDatabaseHealth } from '../../../database/prisma.js';
import { checkRedisHealth } from '../../../infrastructure/redis/client.js';
import { checkLiveKitHealth } from '../../livekit/services/roomService.js';
import { isLiveKitConfigured } from '../../livekit/config.js';
import {
  checkStorageHealth,
  isStorageConfigured,
} from '../../../infrastructure/storage/azureBlob.js';
import { getActiveParticipantIds } from '../../../infrastructure/redis/meetingPresence.js';
import * as meetingRepo from '../../meetings/repositories/meetingRepository.js';
import { teardownMeetingRoom } from '../../livekit/services/livekitMeetingService.js';
import { clearMeetingPresence } from '../../../infrastructure/redis/meetingPresence.js';
import { markAllJoinedAsLeft } from '../../meetings/repositories/participantRepository.js';
import { emitMeetingEnded } from '../../../sockets/emitters.js';
import { serializeMeeting } from '../../meetings/serializers/meetingSerializer.js';
import { serializeUser } from '../../auth/serializers/userSerializer.js';

async function probe(name, checker) {
  try {
    return { name, ...(await checker()) };
  } catch (error) {
    return {
      name,
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getDashboard() {
  const [
    usersTotal,
    usersActive,
    usersSuspended,
    meetingsTotal,
    meetingsLive,
    meetingsScheduled,
    recordingsTotal,
    notificationsPending,
    auditLast24h,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.user.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.meeting.count({ where: { deletedAt: null } }),
    prisma.meeting.count({ where: { deletedAt: null, status: 'LIVE' } }),
    prisma.meeting.count({
      where: { deletedAt: null, status: { in: ['SCHEDULED', 'WAITING'] } },
    }),
    prisma.meetingRecording.count({ where: { deletedAt: null } }),
    prisma.notification.count({ where: { status: 'PENDING' } }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const liveMeetings = await prisma.meeting.findMany({
    where: { deletedAt: null, status: 'LIVE' },
    select: { id: true, title: true, code: true, startedAt: true, ownerId: true },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  const activePresence = await Promise.all(
    liveMeetings.map(async (meeting) => {
      let activeSocketParticipants = 0;
      try {
        activeSocketParticipants = (await getActiveParticipantIds(meeting.id)).length;
      } catch {
        activeSocketParticipants = 0;
      }
      return { ...meeting, activeSocketParticipants };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: usersTotal,
      active: usersActive,
      suspended: usersSuspended,
    },
    meetings: {
      total: meetingsTotal,
      live: meetingsLive,
      scheduled: meetingsScheduled,
    },
    recordings: { total: recordingsTotal },
    notifications: { pending: notificationsPending },
    audit: { last24h: auditLast24h },
    liveMeetings: activePresence,
  };
}

export async function listUsers({
  q,
  status,
  role,
  limit = 50,
  cursor,
} = {}) {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(role ? { globalRole: role } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { profile: { displayName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: { profile: true, settings: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return users.map((user) => serializeUser(user, { includeSettings: true }));
}

export async function getUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { profile: true, settings: true },
  });

  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  return serializeUser(user, { includeSettings: true });
}

export async function suspendUser(actor, userId, { reason } = {}, context = {}) {
  if (actor.id === userId) {
    throw new AppError('Cannot suspend your own account', 400, {
      code: 'CANNOT_SUSPEND_SELF',
    });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  if (user.globalRole === 'SUPER_ADMIN' && actor.globalRole !== 'SUPER_ADMIN') {
    throw new AppError('Cannot suspend a super admin', 403, { code: 'FORBIDDEN' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: 'SUSPENDED' },
    include: { profile: true, settings: true },
  });

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: 'admin.user.suspend',
    resource: 'user',
    resourceId: userId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { reason: reason ?? null },
  });

  return serializeUser(updated, { includeSettings: true });
}

export async function activateUser(actor, userId, context = {}) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status: user.emailVerifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION',
    },
    include: { profile: true, settings: true },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: 'admin.user.activate',
    resource: 'user',
    resourceId: userId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return serializeUser(updated, { includeSettings: true });
}

export async function updateUserRole(actor, userId, globalRole, context = {}) {
  if (actor.globalRole !== 'SUPER_ADMIN') {
    throw new AppError('Only super admins can change roles', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (actor.id === userId && globalRole !== 'SUPER_ADMIN') {
    throw new AppError('Cannot demote your own super admin role', 400, {
      code: 'CANNOT_DEMOTE_SELF',
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { globalRole },
    include: { profile: true, settings: true },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: 'admin.user.role_update',
    resource: 'user',
    resourceId: userId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { globalRole },
  });

  return serializeUser(updated, { includeSettings: true });
}

export async function listMeetings({ status, q, limit = 50, cursor } = {}) {
  const meetings = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { code: { contains: q.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: {
      owner: { include: { profile: true } },
      participants: {
        where: { status: { in: ['WAITING', 'ADMITTED', 'JOINED'] } },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return meetings.map((meeting) => ({
    ...serializeMeeting(meeting),
    activeParticipantCount: meeting.participants.length,
  }));
}

export async function forceEndMeeting(actor, meetingId, context = {}) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  if (meeting.status === 'ENDED') {
    return serializeMeeting(meeting);
  }

  await teardownMeetingRoom(meeting);
  await markAllJoinedAsLeft(meetingId);
  await clearMeetingPresence(meetingId);

  const updated = await meetingRepo.updateMeeting(meetingId, {
    status: 'ENDED',
    endedAt: new Date(),
  });

  await writeAuditLog({
    actorId: actor.id,
    action: 'admin.meeting.force_end',
    resource: 'meeting',
    resourceId: meetingId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  const serialized = serializeMeeting(updated);
  emitMeetingEnded(meetingId, serialized);
  return serialized;
}

export async function listAuditLogs({
  actorId,
  resource,
  action,
  limit = 50,
  cursor,
} = {}) {
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(actorId ? { actorId } : {}),
      ...(resource ? { resource } : {}),
      ...(action ? { action: { contains: action } } : {}),
    },
    include: {
      actor: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return logs.map((log) => ({
    id: log.id,
    actorId: log.actorId,
    actor: log.actor
      ? {
          id: log.actor.id,
          email: log.actor.email,
          displayName: log.actor.profile?.displayName ?? null,
        }
      : null,
    action: log.action,
    resource: log.resource,
    resourceId: log.resourceId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    metadata: log.metadata,
    createdAt: log.createdAt,
  }));
}

export async function getSystemHealth() {
  const checksList = [
    probe('postgres', checkDatabaseHealth),
    probe('redis', checkRedisHealth),
  ];

  if (isLiveKitConfigured()) {
    checksList.push(probe('livekit', checkLiveKitHealth));
  }
  if (isStorageConfigured()) {
    checksList.push(probe('storage', checkStorageHealth));
  }

  const results = await Promise.all(checksList);
  const checks = Object.fromEntries(results.map((item) => [item.name, item]));
  const requiredOk = ['postgres', 'redis'].every((name) => checks[name]?.status === 'up');

  return {
    status: requiredOk ? 'ok' : 'degraded',
    service: env.APP_NAME,
    environment: env.NODE_ENV,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    checks,
  };
}
