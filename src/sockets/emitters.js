import { logger } from '../infrastructure/logging/logger.js';
import { getIO } from './io.js';
import { meetingRoom, meetingWaitingRoom, SOCKET_EVENTS } from './events.js';

function safeEmit(room, event, payload) {
  const io = getIO();
  if (!io) {
    logger.debug({ event, room }, 'socket.emit_skipped_no_io');
    return false;
  }

  io.to(room).emit(event, payload);
  return true;
}

export function emitToMeeting(meetingId, event, payload) {
  return safeEmit(meetingRoom(meetingId), event, {
    meetingId,
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitToMeetingHosts(meetingId, event, payload) {
  return safeEmit(meetingWaitingRoom(meetingId), event, {
    meetingId,
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitMeetingStarted(meetingId, meeting) {
  emitToMeeting(meetingId, SOCKET_EVENTS.MEETING_STARTED, { meeting });
}

export function emitMeetingEnded(meetingId, meeting) {
  emitToMeeting(meetingId, SOCKET_EVENTS.MEETING_ENDED, { meeting });
}

export function emitParticipantJoined(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.PARTICIPANT_JOINED, { participant });
}

export function emitParticipantLeft(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.PARTICIPANT_LEFT, { participant });
}

export function emitParticipantUpdated(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.PARTICIPANT_UPDATED, { participant });
}

export function emitParticipantMuted(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.PARTICIPANT_MUTED, { participant });
}

export function emitParticipantRemoved(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.PARTICIPANT_REMOVED, { participant });
}

export function emitWaitingRoomRequest(meetingId, participant) {
  emitToMeetingHosts(meetingId, SOCKET_EVENTS.WAITING_ROOM_REQUEST, { participant });
}

export function emitWaitingRoomApproved(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.WAITING_ROOM_APPROVED, { participant });
  emitToMeetingHosts(meetingId, SOCKET_EVENTS.WAITING_ROOM_APPROVED, { participant });
}

export function emitWaitingRoomRejected(meetingId, participant) {
  emitToMeetingHosts(meetingId, SOCKET_EVENTS.WAITING_ROOM_REJECTED, { participant });
}

export function emitChatMessage(meetingId, message) {
  emitToMeeting(meetingId, SOCKET_EVENTS.CHAT_MESSAGE, { message });
}

export function emitHandRaised(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.HAND_RAISED, { participant });
}

export function emitScreenSharing(meetingId, participant) {
  emitToMeeting(meetingId, SOCKET_EVENTS.SCREEN_SHARING, { participant });
}
