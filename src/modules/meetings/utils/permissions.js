import { AppError } from '../../../utils/AppError.js';

export function isHostRole(role) {
  return role === 'HOST' || role === 'CO_HOST';
}

export function assertHost(participant, message = 'Host privileges required') {
  if (!participant || !isHostRole(participant.role)) {
    throw new AppError(message, 403, { code: 'HOST_REQUIRED' });
  }
}

export function assertCanModerate(actor, target) {
  assertHost(actor);

  if (target.role === 'HOST' && actor.role !== 'HOST') {
    throw new AppError('Only the host can moderate the host', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (target.role === 'HOST' && actor.userId === target.userId) {
    // Host moderating self is allowed for state updates, not removal.
  }
}

export function assertMeetingJoinable(meeting) {
  if (!meeting || meeting.deletedAt) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  if (['ENDED', 'CANCELLED', 'EXPIRED'].includes(meeting.status)) {
    throw new AppError('Meeting is no longer available', 409, {
      code: 'MEETING_CLOSED',
    });
  }

  if (meeting.expiresAt && meeting.expiresAt.getTime() <= Date.now()) {
    throw new AppError('Meeting has expired', 409, { code: 'MEETING_EXPIRED' });
  }
}

export function defaultParticipantPermissions(role) {
  if (role === 'HOST' || role === 'CO_HOST') {
    return {
      canShareScreen: true,
      canChat: true,
      canUnmuteSelf: true,
      canEnableCamera: true,
      canAdmit: true,
      canRemove: true,
      canMuteOthers: true,
    };
  }

  return {
    canShareScreen: true,
    canChat: true,
    canUnmuteSelf: true,
    canEnableCamera: true,
    canAdmit: false,
    canRemove: false,
    canMuteOthers: false,
  };
}
