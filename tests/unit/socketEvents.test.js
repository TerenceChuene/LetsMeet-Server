import { describe, expect, it } from 'vitest';
import {
  meetingRoom,
  meetingWaitingRoom,
  SOCKET_EVENTS,
} from '../../src/sockets/events.js';
import { meetingJoinSchema, participantUpdateSchema } from '../../src/sockets/validators/socketValidators.js';

describe('socket signalling contracts', () => {
  it('exposes the required application events', () => {
    const required = [
      'meeting:join',
      'meeting:leave',
      'meeting:started',
      'meeting:ended',
      'participant:joined',
      'participant:left',
      'participant:updated',
      'participant:muted',
      'participant:removed',
      'chat:message',
      'chat:typing',
      'hand:raised',
      'screen:sharing',
      'waiting-room:request',
      'waiting-room:approved',
      'waiting-room:rejected',
    ];

    for (const event of required) {
      expect(Object.values(SOCKET_EVENTS)).toContain(event);
    }
  });

  it('builds meeting room names', () => {
    expect(meetingRoom('abc')).toBe('meeting:abc');
    expect(meetingWaitingRoom('abc')).toBe('meeting:abc:hosts');
  });

  it('validates meeting join payloads', () => {
    expect(
      meetingJoinSchema.safeParse({
        meetingId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('requires at least one participant update field', () => {
    expect(
      participantUpdateSchema.safeParse({
        meetingId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);

    expect(
      participantUpdateSchema.safeParse({
        meetingId: '11111111-1111-1111-1111-111111111111',
        handRaised: true,
      }).success,
    ).toBe(true);
  });
});
