import { logger } from '../../../infrastructure/logging/logger.js';
import { prisma } from '../../../database/prisma.js';
import {
  clearMeetingPresence,
  clearParticipantPresence,
  markParticipantActive,
} from '../../../infrastructure/redis/meetingPresence.js';
import { buildLiveKitRoomName } from '../config.js';
import { getWebhookReceiver } from '../livekitClient.js';

function meetingIdFromRoomName(roomName) {
  if (!roomName) return null;
  const match = /^meeting-(.+)$/.exec(roomName);
  return match?.[1] ?? null;
}

export async function receiveWebhook(rawBody, authHeader) {
  const receiver = getWebhookReceiver();
  return receiver.receive(rawBody, authHeader);
}

export async function processWebhookEvent(event) {
  const eventName = event.event;
  const roomName = event.room?.name;
  const meetingId =
    meetingIdFromRoomName(roomName) ??
    (() => {
      try {
        return JSON.parse(event.room?.metadata ?? '{}').meetingId;
      } catch {
        return null;
      }
    })();

  logger.info(
    {
      event: eventName,
      roomName,
      meetingId,
      identity: event.participant?.identity,
    },
    'livekit.webhook',
  );

  switch (eventName) {
    case 'participant_joined':
      return handleParticipantJoined(meetingId, event);
    case 'participant_left':
    case 'participant_connection_aborted':
      return handleParticipantLeft(meetingId, event);
    case 'room_finished':
      return handleRoomFinished(meetingId, roomName);
    case 'egress_started':
    case 'egress_updated':
    case 'egress_ended':
      return handleEgressEvent(event);
    default:
      return { handled: false, event: eventName };
  }
}

async function handleEgressEvent(event) {
  const { applyEgressWebhookUpdate } = await import(
    '../../recordings/services/recordingService.js'
  );
  return applyEgressWebhookUpdate(event.egressInfo ?? event.egress);
}

async function handleParticipantJoined(meetingId, event) {
  if (!meetingId || !event.participant?.identity) {
    return { handled: false };
  }

  const identity = event.participant.identity;

  const participant = await prisma.meetingParticipant.findUnique({
    where: {
      meetingId_userId: {
        meetingId,
        userId: identity,
      },
    },
  });

  if (!participant) {
    return { handled: false, reason: 'unknown_participant' };
  }

  const updated = await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: {
      livekitIdentity: identity,
      status: participant.status === 'WAITING' ? participant.status : 'JOINED',
      joinedAt: participant.joinedAt ?? new Date(),
      leftAt: null,
    },
  });

  if (updated.status === 'JOINED') {
    await markParticipantActive(meetingId, identity, {
      role: updated.role,
      status: updated.status,
      livekit: true,
    });
  }

  return { handled: true, participantId: updated.id };
}

async function handleParticipantLeft(meetingId, event) {
  if (!meetingId || !event.participant?.identity) {
    return { handled: false };
  }

  const identity = event.participant.identity;
  const participant = await prisma.meetingParticipant.findUnique({
    where: {
      meetingId_userId: {
        meetingId,
        userId: identity,
      },
    },
  });

  if (!participant || ['LEFT', 'REMOVED', 'REJECTED'].includes(participant.status)) {
    await clearParticipantPresence(meetingId, identity);
    return { handled: true, noop: true };
  }

  // Host disconnect should not auto-end the meeting — reconnection window.
  if (participant.status === 'JOINED' || participant.status === 'ADMITTED') {
    await prisma.meetingParticipant.update({
      where: { id: participant.id },
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

  await clearParticipantPresence(meetingId, identity);
  return { handled: true };
}

async function handleRoomFinished(meetingId, roomName) {
  const id = meetingId ?? meetingIdFromRoomName(roomName);
  if (!id) {
    return { handled: false };
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, deletedAt: null },
  });

  if (!meeting || meeting.status === 'ENDED') {
    return { handled: true, noop: true };
  }

  await prisma.meetingParticipant.updateMany({
    where: {
      meetingId: id,
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

  await prisma.meeting.update({
    where: { id },
    data: {
      status: 'ENDED',
      endedAt: new Date(),
    },
  });

  await clearMeetingPresence(id);
  return { handled: true, meetingEnded: true };
}

export function resolveRoomNameForMeeting(meeting) {
  return meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
}
