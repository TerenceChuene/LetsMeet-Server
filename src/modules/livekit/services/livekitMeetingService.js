import { AppError } from '../../../utils/AppError.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import * as meetingRepo from '../../meetings/repositories/meetingRepository.js';
import * as participantRepo from '../../meetings/repositories/participantRepository.js';
import { buildLiveKitRoomName, isLiveKitConfigured } from '../config.js';
import { assertLiveKitAvailable, createParticipantToken } from './tokenService.js';
import { closeLiveKitRoom, ensureLiveKitRoom, removeLiveKitParticipant } from './roomService.js';

export async function provisionMeetingRoom(meeting) {
  const result = await ensureLiveKitRoom(meeting);
  if (result.skipped) {
    return meeting;
  }

  if (meeting.livekitRoomName === result.roomName) {
    return meeting;
  }

  return meetingRepo.updateMeeting(meeting.id, {
    livekitRoomName: result.roomName,
  });
}

export async function teardownMeetingRoom(meeting) {
  try {
    await closeLiveKitRoom(meeting);
  } catch (error) {
    logger.error({ err: error, meetingId: meeting.id }, 'livekit.teardown_failed');
  }
}

export async function issueMediaTokenForUser(meetingId, user) {
  assertLiveKitAvailable();

  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting || meeting.deletedAt) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  if (!['LIVE', 'WAITING'].includes(meeting.status)) {
    throw new AppError('Meeting is not accepting media connections', 409, {
      code: 'MEETING_NOT_LIVE',
    });
  }

  const participant = await participantRepo.findParticipant(meetingId, user.id);
  if (!participant || participant.status !== 'JOINED') {
    throw new AppError('Join and wait for admission before requesting media access', 403, {
      code: 'MEDIA_ACCESS_DENIED',
    });
  }

  const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);

  if (!meeting.livekitRoomName && isLiveKitConfigured()) {
    await provisionMeetingRoom(meeting);
  }

  const identity = user.id;
  const tokenPayload = await createParticipantToken({
    roomName,
    identity,
    displayName:
      participant.displayName ?? user.profile?.displayName ?? user.email,
    role: participant.role,
    isMutedByHost: participant.isMutedByHost,
    metadata: {
      meetingId: meeting.id,
      participantId: participant.id,
    },
  });

  await participantRepo.updateParticipant(meetingId, user.id, {
    livekitIdentity: identity,
  });

  return {
    ...tokenPayload,
    meetingId: meeting.id,
    role: participant.role,
  };
}

export async function issueMediaTokenIfJoined(meeting, participant, user) {
  if (!isLiveKitConfigured()) {
    return null;
  }

  if (!participant || participant.status !== 'JOINED') {
    return null;
  }

  if (!['LIVE', 'WAITING'].includes(meeting.status) && meeting.status !== 'SCHEDULED') {
    return null;
  }

  try {
    const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
    return createParticipantToken({
      roomName,
      identity: user.id,
      displayName:
        participant.displayName ?? user.profile?.displayName ?? user.email,
      role: participant.role,
      isMutedByHost: participant.isMutedByHost,
      metadata: {
        meetingId: meeting.id,
        participantId: participant.id,
      },
    });
  } catch (error) {
    logger.warn({ err: error, meetingId: meeting.id }, 'livekit.token_issue_failed');
    return null;
  }
}

export async function ejectParticipantFromMedia(meeting, userId) {
  await removeLiveKitParticipant(meeting, userId);
}
