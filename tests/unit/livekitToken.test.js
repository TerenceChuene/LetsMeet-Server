import { describe, expect, it } from 'vitest';
import { buildLiveKitRoomName, getLiveKitApiHost } from '../../src/modules/livekit/config.js';
import { buildVideoGrant } from '../../src/modules/livekit/services/tokenService.js';

describe('livekit helpers', () => {
  it('builds deterministic room names', () => {
    expect(buildLiveKitRoomName('11111111-1111-1111-1111-111111111111')).toBe(
      'meeting-11111111-1111-1111-1111-111111111111',
    );
  });

  it('maps ws client URLs to http API hosts', () => {
    expect(getLiveKitApiHost()).toMatch(/^https?:\/\//);
  });

  it('grants roomAdmin to hosts and blocks publish when muted', () => {
    const hostGrant = buildVideoGrant({
      roomName: 'meeting-1',
      role: 'HOST',
      isMutedByHost: false,
    });
    expect(hostGrant.roomAdmin).toBe(true);
    expect(hostGrant.canPublish).toBe(true);

    const muted = buildVideoGrant({
      roomName: 'meeting-1',
      role: 'PARTICIPANT',
      isMutedByHost: true,
    });
    expect(muted.canPublish).toBe(false);
    expect(muted.roomAdmin).toBe(false);
  });
});
