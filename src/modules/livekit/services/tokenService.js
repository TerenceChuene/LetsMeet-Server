import { AppError } from '../../../utils/AppError.js';
import { isHostRole } from '../../meetings/utils/permissions.js';
import {
  getLiveKitClientUrl,
  isLiveKitConfigured,
  requireLiveKitConfig,
} from '../config.js';
import { createAccessToken } from '../livekitClient.js';

/**
 * Build VideoGrant permissions from application participant state.
 * Host/co-host get roomAdmin; host-muted participants cannot publish.
 */
export function buildVideoGrant({ roomName, role, isMutedByHost = false }) {
  const host = isHostRole(role);

  return {
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    canPublish: !isMutedByHost,
    roomAdmin: host,
    canPublishSources: isMutedByHost
      ? ['camera', 'screen_share', 'screen_share_audio']
      : undefined,
  };
}

export async function createParticipantToken({
  roomName,
  identity,
  displayName,
  role,
  isMutedByHost = false,
  metadata = {},
  ttl = '2h',
}) {
  requireLiveKitConfig();

  const at = createAccessToken({
    identity,
    name: displayName,
    ttl,
    metadata: JSON.stringify({
      role,
      ...metadata,
    }),
  });

  at.addGrant(
    buildVideoGrant({
      roomName,
      role,
      isMutedByHost,
    }),
  );

  const token = await at.toJwt();

  return {
    token,
    url: getLiveKitClientUrl(),
    roomName,
    identity,
    expiresIn: ttl,
  };
}

export function assertLiveKitAvailable() {
  if (!isLiveKitConfigured()) {
    throw new AppError('LiveKit media server is not configured', 503, {
      code: 'LIVEKIT_NOT_CONFIGURED',
    });
  }
}
