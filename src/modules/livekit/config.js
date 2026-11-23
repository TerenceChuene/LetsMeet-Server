import { env } from '../../config/env.js';

export function isLiveKitConfigured() {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/**
 * WebSocket URL returned to clients for media connections.
 */
export function getLiveKitClientUrl() {
  return env.LIVEKIT_URL;
}

/**
 * HTTP(S) host for RoomService / webhook APIs.
 * Derives from LIVEKIT_URL when LIVEKIT_API_HOST is unset.
 */
export function getLiveKitApiHost() {
  if (env.LIVEKIT_API_HOST) {
    return env.LIVEKIT_API_HOST.replace(/\/$/, '');
  }

  const url = env.LIVEKIT_URL ?? '';
  return url
    .replace(/^ws:/i, 'http:')
    .replace(/^wss:/i, 'https:')
    .replace(/\/$/, '');
}

export function requireLiveKitConfig() {
  if (!isLiveKitConfigured()) {
    const error = new Error('LiveKit is not configured');
    error.code = 'LIVEKIT_NOT_CONFIGURED';
    throw error;
  }
}

export function buildLiveKitRoomName(meetingId) {
  return `meeting-${meetingId}`;
}
