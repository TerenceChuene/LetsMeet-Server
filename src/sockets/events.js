/**
 * Application-level realtime events.
 * Audio/video media is never transported over these channels — LiveKit owns media.
 */
export const SOCKET_EVENTS = {
  MEETING_JOIN: 'meeting:join',
  MEETING_LEAVE: 'meeting:leave',
  MEETING_STARTED: 'meeting:started',
  MEETING_ENDED: 'meeting:ended',
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_UPDATED: 'participant:updated',
  PARTICIPANT_MUTED: 'participant:muted',
  PARTICIPANT_REMOVED: 'participant:removed',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  HAND_RAISED: 'hand:raised',
  SCREEN_SHARING: 'screen:sharing',
  WAITING_ROOM_REQUEST: 'waiting-room:request',
  WAITING_ROOM_APPROVED: 'waiting-room:approved',
  WAITING_ROOM_REJECTED: 'waiting-room:rejected',
  ERROR: 'error',
};

export function meetingRoom(meetingId) {
  return `meeting:${meetingId}`;
}

export function meetingWaitingRoom(meetingId) {
  return `meeting:${meetingId}:hosts`;
}

export function meetingPresenceRoom(meetingId) {
  return `meeting:${meetingId}:presence`;
}
