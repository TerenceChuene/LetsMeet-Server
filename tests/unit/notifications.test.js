import { describe, expect, it } from 'vitest';
import { serializeNotification } from '../../src/modules/notifications/services/notificationService.js';

describe('notification serializer', () => {
  it('maps notification fields for API responses', () => {
    const serialized = serializeNotification({
      id: '1',
      userId: '2',
      channel: 'IN_APP',
      type: 'meeting.invitation',
      title: 'Invite',
      body: 'Join us',
      status: 'SENT',
      payload: { meetingId: 'm1' },
      readAt: null,
      sentAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(serialized.type).toBe('meeting.invitation');
    expect(serialized.payload.meetingId).toBe('m1');
    expect(serialized.readAt).toBeNull();
  });
});
