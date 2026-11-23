import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';
import {
  clearParticipantPresence,
  markParticipantActive,
} from '../../../infrastructure/redis/meetingPresence.js';
import * as meetingRepo from '../repositories/meetingRepository.js';
import * as participantRepo from '../repositories/participantRepository.js';
import { serializeParticipant } from '../serializers/meetingSerializer.js';
import {
  assertCanModerate,
  assertHost,
  defaultParticipantPermissions,
  isHostRole,
} from '../utils/permissions.js';
import {
  ejectParticipantFromMedia,
  issueMediaTokenIfJoined,
  provisionMeetingRoom,
} from '../../livekit/services/livekitMeetingService.js';
import { syncLiveKitParticipantPermissions } from '../../livekit/services/roomService.js';
import {
  emitHandRaised,
  emitParticipantJoined,
  emitParticipantMuted,
  emitParticipantRemoved,
  emitParticipantUpdated,
  emitScreenSharing,
  emitWaitingRoomApproved,
  emitWaitingRoomRejected,
} from '../../../sockets/emitters.js';

export function serialize(participant) {
  return serializeParticipant(participant);
}

async function getMeetingOrThrow(meetingId) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }
  return meeting;
}

async function getActorOrThrow(meetingId, userId, { allowWaiting = false } = {}) {
  const actor = await participantRepo.findParticipant(meetingId, userId);
  const allowed = allowWaiting
    ? ['WAITING', 'ADMITTED', 'JOINED']
    : ['ADMITTED', 'JOINED'];

  if (!actor || !allowed.includes(actor.status)) {
    throw new AppError('You are not an active participant', 403, {
      code: 'NOT_A_PARTICIPANT',
    });
  }
  return actor;
}

export async function listParticipants(meetingId, requester, query = {}) {
  await getMeetingOrThrow(meetingId);
  await getActorOrThrow(meetingId, requester.id);

  const participants = await participantRepo.listParticipants(meetingId, query);
  return participants.map(serializeParticipant);
}

export async function updateParticipant(meetingId, targetUserId, requester, payload, context = {}) {
  await getMeetingOrThrow(meetingId);
  const actor = await getActorOrThrow(meetingId, requester.id);
  const target = await participantRepo.findParticipant(meetingId, targetUserId);

  if (!target) {
    throw new AppError('Participant not found', 404, { code: 'PARTICIPANT_NOT_FOUND' });
  }

  const isSelf = actor.userId === target.userId;
  const hostFields = ['role', 'isMutedByHost', 'permissions'];
  const touchesHostFields = hostFields.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );

  if (!isSelf || touchesHostFields) {
    assertCanModerate(actor, target);
  }

  if (payload.role) {
    if (actor.role !== 'HOST') {
      throw new AppError('Only the host can change roles', 403, { code: 'HOST_REQUIRED' });
    }
    if (target.role === 'HOST' && payload.role !== 'HOST') {
      throw new AppError('Transfer host role before demoting the host', 409, {
        code: 'HOST_TRANSFER_REQUIRED',
      });
    }
  }

  if (isSelf && payload.isMutedByHost === false && target.isMutedByHost && !isHostRole(actor.role)) {
    throw new AppError('Only a host can unmute a host-muted participant', 403, {
      code: 'MUTED_BY_HOST',
    });
  }

  if (target.isMutedByHost && payload.micEnabled === true && !isHostRole(actor.role)) {
    throw new AppError('You are muted by the host', 403, { code: 'MUTED_BY_HOST' });
  }

  const data = { ...payload };
  if (payload.role) {
    data.permissions = {
      ...defaultParticipantPermissions(payload.role),
      ...(payload.permissions ?? {}),
    };
  }

  if (payload.isMutedByHost === true) {
    data.micEnabled = false;
  }

  const updated = await participantRepo.updateParticipant(meetingId, targetUserId, data);
  const meeting = await meetingRepo.findMeetingById(meetingId);

  if (['JOINED', 'ADMITTED'].includes(updated.status)) {
    await markParticipantActive(meetingId, targetUserId, {
      role: updated.role,
      status: updated.status,
      micEnabled: updated.micEnabled,
      cameraEnabled: updated.cameraEnabled,
      screenSharing: updated.screenSharing,
      handRaised: updated.handRaised,
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, 'isMutedByHost') ||
    Object.prototype.hasOwnProperty.call(payload, 'role')
  ) {
    await syncLiveKitParticipantPermissions(meeting, updated);
  }

  await writeAuditLog({
    actorId: requester.id,
    action: 'participant.update',
    resource: 'meeting_participant',
    resourceId: updated.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId, targetUserId, fields: Object.keys(payload) },
  });

  const serialized = serializeParticipant(updated);
  emitParticipantUpdated(meetingId, serialized);

  if (payload.isMutedByHost === true) {
    emitParticipantMuted(meetingId, serialized);
  }
  if (payload.handRaised !== undefined) {
    emitHandRaised(meetingId, serialized);
  }
  if (payload.screenSharing !== undefined) {
    emitScreenSharing(meetingId, serialized);
  }

  return serialized;
}

export async function removeParticipant(meetingId, targetUserId, requester, context = {}) {
  await getMeetingOrThrow(meetingId);
  const actor = await getActorOrThrow(meetingId, requester.id);
  const target = await participantRepo.findParticipant(meetingId, targetUserId);

  if (!target) {
    throw new AppError('Participant not found', 404, { code: 'PARTICIPANT_NOT_FOUND' });
  }

  if (target.userId === requester.id) {
    throw new AppError('Use leave endpoint to leave a meeting', 400, {
      code: 'USE_LEAVE',
    });
  }

  assertCanModerate(actor, target);

  if (target.role === 'HOST') {
    throw new AppError('Cannot remove the meeting host', 403, { code: 'CANNOT_REMOVE_HOST' });
  }

  const meeting = await meetingRepo.findMeetingById(meetingId);

  const updated = await participantRepo.updateParticipant(meetingId, targetUserId, {
    status: 'REMOVED',
    leftAt: new Date(),
    micEnabled: false,
    cameraEnabled: false,
    screenSharing: false,
    handRaised: false,
  });

  await clearParticipantPresence(meetingId, targetUserId);
  await ejectParticipantFromMedia(meeting, targetUserId);

  await writeAuditLog({
    actorId: requester.id,
    action: 'participant.remove',
    resource: 'meeting_participant',
    resourceId: updated.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId, targetUserId },
  });

  const serialized = serializeParticipant(updated);
  emitParticipantRemoved(meetingId, serialized);
  return serialized;
}

export async function approveWaitingParticipant(meetingId, targetUserId, requester, context = {}) {
  await getMeetingOrThrow(meetingId);
  const actor = await getActorOrThrow(meetingId, requester.id);
  assertHost(actor);

  const target = await participantRepo.findParticipant(meetingId, targetUserId);
  if (!target || target.status !== 'WAITING') {
    throw new AppError('No waiting-room request found', 404, {
      code: 'WAITING_REQUEST_NOT_FOUND',
    });
  }

  let meeting = await meetingRepo.findMeetingById(meetingId);

  const updated = await participantRepo.updateParticipant(meetingId, targetUserId, {
    status: 'JOINED',
    joinedAt: new Date(),
  });

  await markParticipantActive(meetingId, targetUserId, {
    role: updated.role,
    status: updated.status,
  });

  if (meeting.status === 'SCHEDULED' || meeting.status === 'WAITING') {
    meeting = await meetingRepo.updateMeeting(meetingId, {
      status: 'LIVE',
      startedAt: meeting.startedAt ?? new Date(),
    });
  }

  meeting = await provisionMeetingRoom(meeting);

  const media = await issueMediaTokenIfJoined(meeting, updated, {
    id: targetUserId,
    email: updated.user?.email,
    profile: updated.user?.profile,
  });

  await writeAuditLog({
    actorId: requester.id,
    action: 'waiting_room.approved',
    resource: 'meeting_participant',
    resourceId: updated.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId, targetUserId },
  });

  const serialized = serializeParticipant(updated);
  emitWaitingRoomApproved(meetingId, serialized);
  emitParticipantJoined(meetingId, serialized);

  return {
    ...serialized,
    media,
  };
}

export async function rejectWaitingParticipant(meetingId, targetUserId, requester, context = {}) {
  await getMeetingOrThrow(meetingId);
  const actor = await getActorOrThrow(meetingId, requester.id);
  assertHost(actor);

  const target = await participantRepo.findParticipant(meetingId, targetUserId);
  if (!target || target.status !== 'WAITING') {
    throw new AppError('No waiting-room request found', 404, {
      code: 'WAITING_REQUEST_NOT_FOUND',
    });
  }

  const updated = await participantRepo.updateParticipant(meetingId, targetUserId, {
    status: 'REJECTED',
    leftAt: new Date(),
  });

  await clearParticipantPresence(meetingId, targetUserId);

  await writeAuditLog({
    actorId: requester.id,
    action: 'waiting_room.rejected',
    resource: 'meeting_participant',
    resourceId: updated.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId, targetUserId },
  });

  const serialized = serializeParticipant(updated);
  emitWaitingRoomRejected(meetingId, serialized);
  return serialized;
}

export async function listWaitingRoom(meetingId, requester) {
  await getMeetingOrThrow(meetingId);
  const actor = await getActorOrThrow(meetingId, requester.id);
  assertHost(actor);

  const waiting = await participantRepo.listParticipants(meetingId, { status: 'WAITING' });
  return waiting.map(serializeParticipant);
}
