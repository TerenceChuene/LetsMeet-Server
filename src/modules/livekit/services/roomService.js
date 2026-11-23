import { logger } from '../../../infrastructure/logging/logger.js';
import { buildLiveKitRoomName, isLiveKitConfigured } from '../config.js';
import { getRoomServiceClient } from '../livekitClient.js';

export async function ensureLiveKitRoom(meeting) {
  if (!isLiveKitConfigured()) {
    logger.warn({ meetingId: meeting.id }, 'livekit.skip_ensure_room');
    return {
      roomName: meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id),
      created: false,
      skipped: true,
    };
  }

  const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
  const client = getRoomServiceClient();

  try {
    await client.createRoom({
      name: roomName,
      emptyTimeout: 60 * 10,
      departureTimeout: 20,
      maxParticipants: meeting.maxParticipants ?? undefined,
      metadata: JSON.stringify({
        meetingId: meeting.id,
        code: meeting.code,
        title: meeting.title,
      }),
    });

    logger.info({ meetingId: meeting.id, roomName }, 'livekit.room_created');
    return { roomName, created: true, skipped: false };
  } catch (error) {
    // Room may already exist — treat as success.
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|conflict/i.test(message)) {
      logger.info({ meetingId: meeting.id, roomName }, 'livekit.room_exists');
      return { roomName, created: false, skipped: false };
    }

    logger.error({ err: error, meetingId: meeting.id, roomName }, 'livekit.room_create_failed');
    throw error;
  }
}

export async function closeLiveKitRoom(meeting) {
  if (!isLiveKitConfigured()) {
    logger.warn({ meetingId: meeting.id }, 'livekit.skip_close_room');
    return { skipped: true };
  }

  const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
  const client = getRoomServiceClient();

  try {
    await client.deleteRoom(roomName);
    logger.info({ meetingId: meeting.id, roomName }, 'livekit.room_deleted');
    return { roomName, deleted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|does not exist/i.test(message)) {
      return { roomName, deleted: false };
    }
    logger.error({ err: error, meetingId: meeting.id, roomName }, 'livekit.room_delete_failed');
    throw error;
  }
}

export async function removeLiveKitParticipant(meeting, identity) {
  if (!isLiveKitConfigured()) {
    return { skipped: true };
  }

  const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
  const client = getRoomServiceClient();

  try {
    await client.removeParticipant(roomName, identity);
    return { removed: true };
  } catch (error) {
    logger.warn(
      { err: error, meetingId: meeting.id, identity },
      'livekit.remove_participant_failed',
    );
    return { removed: false };
  }
}

export async function syncLiveKitParticipantPermissions(meeting, participant) {
  if (!isLiveKitConfigured() || !participant?.livekitIdentity) {
    return { skipped: true };
  }

  const roomName = meeting.livekitRoomName ?? buildLiveKitRoomName(meeting.id);
  const client = getRoomServiceClient();
  const host = participant.role === 'HOST' || participant.role === 'CO_HOST';

  try {
    await client.updateParticipant(roomName, participant.livekitIdentity, {
      permission: {
        canSubscribe: true,
        canPublish: !participant.isMutedByHost,
        canPublishData: true,
        canUpdateMetadata: true,
        hidden: false,
        recorder: false,
      },
      metadata: JSON.stringify({
        role: participant.role,
        meetingId: meeting.id,
        isMutedByHost: participant.isMutedByHost,
      }),
      name: participant.displayName ?? undefined,
    });

    // roomAdmin is token-time only; publish rights are enforced live here.
    void host;
    return { updated: true };
  } catch (error) {
    logger.warn(
      { err: error, meetingId: meeting.id, identity: participant.livekitIdentity },
      'livekit.permission_sync_failed',
    );
    return { updated: false };
  }
}

export async function checkLiveKitHealth() {
  if (!isLiveKitConfigured()) {
    return { status: 'unconfigured' };
  }

  const started = Date.now();
  const client = getRoomServiceClient();
  await client.listRooms();
  return {
    status: 'up',
    latencyMs: Date.now() - started,
  };
}
