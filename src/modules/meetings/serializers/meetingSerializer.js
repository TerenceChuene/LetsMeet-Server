export function serializeParticipant(participant) {
  if (!participant) return null;

  return {
    id: participant.id,
    meetingId: participant.meetingId,
    userId: participant.userId,
    role: participant.role,
    status: participant.status,
    displayName:
      participant.displayName ??
      participant.user?.profile?.displayName ??
      participant.user?.email ??
      null,
    micEnabled: participant.micEnabled,
    cameraEnabled: participant.cameraEnabled,
    screenSharing: participant.screenSharing,
    handRaised: participant.handRaised,
    isMutedByHost: participant.isMutedByHost,
    permissions: participant.permissions,
    livekitIdentity: participant.livekitIdentity,
    joinedAt: participant.joinedAt,
    leftAt: participant.leftAt,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
    user: participant.user
      ? {
          id: participant.user.id,
          email: participant.user.email,
          displayName: participant.user.profile?.displayName ?? null,
          avatarUrl: participant.user.profile?.avatarUrl ?? null,
        }
      : undefined,
  };
}

export function serializeMeeting(meeting, { includePassword = false } = {}) {
  if (!meeting) return null;

  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    description: meeting.description,
    ownerId: meeting.ownerId,
    visibility: meeting.visibility,
    status: meeting.status,
    hasPassword: Boolean(meeting.passwordHash),
    ...(includePassword ? {} : {}),
    waitingRoomEnabled: meeting.waitingRoomEnabled,
    scheduledStartAt: meeting.scheduledStartAt,
    scheduledEndAt: meeting.scheduledEndAt,
    startedAt: meeting.startedAt,
    endedAt: meeting.endedAt,
    expiresAt: meeting.expiresAt,
    maxParticipants: meeting.maxParticipants,
    livekitRoomName: meeting.livekitRoomName,
    settings: meeting.settings,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    owner: meeting.owner
      ? {
          id: meeting.owner.id,
          email: meeting.owner.email,
          displayName: meeting.owner.profile?.displayName ?? null,
        }
      : undefined,
    participants: Array.isArray(meeting.participants)
      ? meeting.participants.map(serializeParticipant)
      : undefined,
    participantCount: Array.isArray(meeting.participants)
      ? meeting.participants.filter((p) =>
          ['WAITING', 'ADMITTED', 'JOINED'].includes(p.status),
        ).length
      : undefined,
  };
}
