import { AppError } from '../../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';
import {
  clearMeetingPresence,
  clearParticipantPresence,
  markParticipantActive,
  markParticipantWaiting,
} from '../../../infrastructure/redis/meetingPresence.js';
import * as meetingRepo from '../repositories/meetingRepository.js';
import * as participantRepo from '../repositories/participantRepository.js';
import {
  serializeMeeting,
  serializeParticipant,
} from '../serializers/meetingSerializer.js';
import { generateMeetingCode } from '../utils/meetingCode.js';
import {
  assertHost,
  assertMeetingJoinable,
  defaultParticipantPermissions,
  isHostRole,
} from '../utils/permissions.js';
import {
  ejectParticipantFromMedia,
  issueMediaTokenIfJoined,
  provisionMeetingRoom,
  teardownMeetingRoom,
} from '../../livekit/services/livekitMeetingService.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import {
  emitMeetingEnded,
  emitMeetingStarted,
  emitParticipantJoined,
  emitParticipantLeft,
  emitWaitingRoomRequest,
} from '../../../sockets/emitters.js';

async function allocateUniqueCode(attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const code = generateMeetingCode();
    if (!(await meetingRepo.codeExists(code))) {
      return code;
    }
  }
  throw new AppError('Unable to allocate meeting code', 500, {
    code: 'CODE_ALLOCATION_FAILED',
  });
}

async function getMeetingOrThrow(meetingId) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }
  return meeting;
}

export async function createMeeting(owner, payload, context = {}) {
  const code = await allocateUniqueCode();
  const passwordHash = payload.password ? await hashPassword(payload.password) : null;

  const meeting = await meetingRepo.createMeeting({
    code,
    title: payload.title,
    description: payload.description ?? null,
    ownerId: owner.id,
    visibility: payload.visibility ?? 'PRIVATE',
    passwordHash,
    waitingRoomEnabled: payload.waitingRoomEnabled ?? true,
    scheduledStartAt: payload.scheduledStartAt ?? null,
    scheduledEndAt: payload.scheduledEndAt ?? null,
    expiresAt: payload.expiresAt ?? null,
    maxParticipants: payload.maxParticipants ?? null,
    settings: payload.settings ?? {},
    status: payload.scheduledStartAt ? 'SCHEDULED' : 'WAITING',
    participants: {
      create: {
        userId: owner.id,
        role: 'HOST',
        status: 'JOINED',
        displayName: owner.profile?.displayName ?? owner.email,
        permissions: defaultParticipantPermissions('HOST'),
        joinedAt: new Date(),
      },
    },
  });

  await markParticipantActive(meeting.id, owner.id, { role: 'HOST', status: 'JOINED' });

  await writeAuditLog({
    actorId: owner.id,
    action: 'meeting.create',
    resource: 'meeting',
    resourceId: meeting.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { code: meeting.code },
  });

  return serializeMeeting(meeting);
}

export async function listMeetings(userId, query = {}) {
  const meetings = await meetingRepo.listMeetingsForUser(userId, query);
  return meetings.map((meeting) => serializeMeeting(meeting));
}

export async function getMeeting(meetingId, requester) {
  const meeting = await getMeetingOrThrow(meetingId);

  const isOwner = meeting.ownerId === requester.id;
  const isParticipant = meeting.participants.some((p) => p.userId === requester.id);
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.globalRole);

  if (meeting.visibility === 'PRIVATE' && !isOwner && !isParticipant && !isAdmin) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  return serializeMeeting(meeting);
}

export async function updateMeeting(meetingId, requester, payload, context = {}) {
  const meeting = await getMeetingOrThrow(meetingId);
  const actor = await participantRepo.findParticipant(meetingId, requester.id);

  if (meeting.ownerId !== requester.id) {
    assertHost(actor, 'Only the host or co-host can update this meeting');
  }

  const data = { ...payload };
  if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
    data.passwordHash =
      payload.password === null || payload.password === undefined
        ? null
        : await hashPassword(payload.password);
    delete data.password;
  }

  const updated = await meetingRepo.updateMeeting(meetingId, data);

  await writeAuditLog({
    actorId: requester.id,
    action: 'meeting.update',
    resource: 'meeting',
    resourceId: meetingId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { fields: Object.keys(payload) },
  });

  return serializeMeeting(updated);
}

export async function startMeeting(meetingId, requester, context = {}) {
  const meeting = await getMeetingOrThrow(meetingId);
  const actor = await participantRepo.findParticipant(meetingId, requester.id);
  assertHost(actor);

  if (['ENDED', 'CANCELLED', 'EXPIRED'].includes(meeting.status)) {
    throw new AppError('Cannot start a closed meeting', 409, { code: 'MEETING_CLOSED' });
  }

  let provisioned = meeting;
  try {
    provisioned = await provisionMeetingRoom(meeting);
  } catch (error) {
    logger.error({ err: error, meetingId }, 'livekit.provision_on_start_failed');
    throw new AppError('Failed to provision media room', 502, {
      code: 'LIVEKIT_ROOM_ERROR',
    });
  }

  const updated = await meetingRepo.updateMeeting(meetingId, {
    status: 'LIVE',
    startedAt: meeting.startedAt ?? new Date(),
    livekitRoomName: provisioned.livekitRoomName ?? meeting.livekitRoomName,
  });

  await writeAuditLog({
    actorId: requester.id,
    action: 'meeting.start',
    resource: 'meeting',
    resourceId: meetingId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  const media = await issueMediaTokenIfJoined(updated, actor, requester);
  const serialized = serializeMeeting(updated);
  emitMeetingStarted(meetingId, serialized);

  return {
    ...serialized,
    media,
  };
}

export async function endMeeting(meetingId, requester, context = {}) {
  const meeting = await getMeetingOrThrow(meetingId);
  const actor = await participantRepo.findParticipant(meetingId, requester.id);

  if (meeting.ownerId !== requester.id) {
    assertHost(actor);
  }

  if (meeting.status === 'ENDED') {
    return serializeMeeting(meeting);
  }

  await teardownMeetingRoom(meeting);
  await participantRepo.markAllJoinedAsLeft(meetingId);
  await clearMeetingPresence(meetingId);

  const updated = await meetingRepo.updateMeeting(meetingId, {
    status: 'ENDED',
    endedAt: new Date(),
  });

  await writeAuditLog({
    actorId: requester.id,
    action: 'meeting.end',
    resource: 'meeting',
    resourceId: meetingId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  const serialized = serializeMeeting(updated);
  emitMeetingEnded(meetingId, serialized);
  return serialized;
}

export async function joinMeeting(meetingId, requester, payload = {}, context = {}) {
  const meeting = await getMeetingOrThrow(meetingId);
  return completeJoin(meeting, requester, payload, context);
}

export async function joinMeetingByCode(requester, payload, context = {}) {
  const meeting = await meetingRepo.findMeetingByCode(payload.code);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }
  return completeJoin(meeting, requester, payload, context);
}

async function completeJoin(meeting, requester, payload, context) {
  assertMeetingJoinable(meeting);

  if (meeting.passwordHash) {
    if (!payload.password) {
      throw new AppError('Meeting password is required', 403, {
        code: 'PASSWORD_REQUIRED',
      });
    }
    const ok = await verifyPassword(meeting.passwordHash, payload.password);
    if (!ok) {
      throw new AppError('Invalid meeting password', 403, {
        code: 'INVALID_PASSWORD',
      });
    }
  }

  const existing = await participantRepo.findParticipant(meeting.id, requester.id);

  if (existing?.status === 'REMOVED') {
    throw new AppError('You were removed from this meeting', 403, {
      code: 'PARTICIPANT_REMOVED',
    });
  }

  if (existing?.status === 'REJECTED') {
    throw new AppError('Your join request was rejected', 403, {
      code: 'PARTICIPANT_REJECTED',
    });
  }

  const activeCount = await meetingRepo.countActiveParticipants(meeting.id);
  const isReturning =
    existing && ['WAITING', 'ADMITTED', 'JOINED'].includes(existing.status);

  if (
    meeting.maxParticipants &&
    !isReturning &&
    activeCount >= meeting.maxParticipants
  ) {
    throw new AppError('Meeting is full', 409, { code: 'MEETING_FULL' });
  }

  const isOwner = meeting.ownerId === requester.id;
  const bypassWaitingRoom = isOwner || (existing && isHostRole(existing.role));
  const shouldWait = meeting.waitingRoomEnabled && !bypassWaitingRoom;

  const role = isOwner ? 'HOST' : existing?.role ?? 'PARTICIPANT';
  const nextStatus = shouldWait ? 'WAITING' : 'JOINED';

  const participant = await participantRepo.upsertParticipant(meeting.id, requester.id, {
    role,
    status: nextStatus,
    displayName:
      payload.displayName ??
      existing?.displayName ??
      requester.profile?.displayName ??
      requester.email,
    permissions: existing?.permissions ?? defaultParticipantPermissions(role),
    joinedAt: nextStatus === 'JOINED' ? new Date() : existing?.joinedAt ?? null,
    leftAt: null,
    micEnabled: false,
    cameraEnabled: false,
    screenSharing: false,
    handRaised: false,
    isMutedByHost: false,
  });

  if (nextStatus === 'WAITING') {
    await markParticipantWaiting(meeting.id, requester.id);
  } else {
    await markParticipantActive(meeting.id, requester.id, {
      role: participant.role,
      status: participant.status,
    });
  }

  if (meeting.status === 'SCHEDULED' && (isOwner || nextStatus === 'JOINED')) {
    await meetingRepo.updateMeeting(meeting.id, {
      status: isOwner ? 'LIVE' : 'WAITING',
      startedAt: isOwner ? new Date() : meeting.startedAt,
    });
  }

  let refreshed = await meetingRepo.findMeetingById(meeting.id);

  if (nextStatus === 'JOINED' && (isOwner || refreshed.status === 'LIVE')) {
    try {
      if (isOwner || refreshed.status === 'LIVE') {
        refreshed = await provisionMeetingRoom(refreshed);
        if (isOwner && refreshed.status !== 'LIVE') {
          refreshed = await meetingRepo.updateMeeting(meeting.id, {
            status: 'LIVE',
            startedAt: refreshed.startedAt ?? new Date(),
          });
        }
      }
    } catch (error) {
      logger.error({ err: error, meetingId: meeting.id }, 'livekit.provision_on_join_failed');
    }
  }

  await writeAuditLog({
    actorId: requester.id,
    action: shouldWait ? 'meeting.waiting_room_request' : 'meeting.join',
    resource: 'meeting',
    resourceId: meeting.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  refreshed = await meetingRepo.findMeetingById(meeting.id);
  const media = await issueMediaTokenIfJoined(refreshed, participant, requester);
  const serializedParticipant = serializeParticipant(participant);

  if (shouldWait) {
    emitWaitingRoomRequest(meeting.id, serializedParticipant);
  } else {
    emitParticipantJoined(meeting.id, serializedParticipant);
  }

  return {
    meeting: serializeMeeting(refreshed),
    participant: serializedParticipant,
    waitingRoom: shouldWait,
    media,
  };
}

export async function leaveMeeting(meetingId, requester, context = {}) {
  const meeting = await getMeetingOrThrow(meetingId);
  const participant = await participantRepo.findParticipant(meetingId, requester.id);

  if (!participant) {
    throw new AppError('You are not a participant in this meeting', 404, {
      code: 'PARTICIPANT_NOT_FOUND',
    });
  }

  if (participant.role === 'HOST' && meeting.status === 'LIVE') {
    const others = meeting.participants.filter(
      (p) =>
        p.userId !== requester.id &&
        isHostRole(p.role) &&
        ['JOINED', 'ADMITTED'].includes(p.status),
    );

    if (others.length === 0) {
      // Host leaving a live meeting without co-host ends the meeting.
      return endMeeting(meetingId, requester, context);
    }
  }

  const updated = await participantRepo.updateParticipant(meetingId, requester.id, {
    status: 'LEFT',
    leftAt: new Date(),
    micEnabled: false,
    cameraEnabled: false,
    screenSharing: false,
    handRaised: false,
  });

  await clearParticipantPresence(meetingId, requester.id);

  await ejectParticipantFromMedia(meeting, requester.id);

  await writeAuditLog({
    actorId: requester.id,
    action: 'meeting.leave',
    resource: 'meeting',
    resourceId: meetingId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  const serializedParticipant = serializeParticipant(updated);
  emitParticipantLeft(meetingId, serializedParticipant);

  return {
    meeting: serializeMeeting(await meetingRepo.findMeetingById(meetingId)),
    participant: serializedParticipant,
  };
}
