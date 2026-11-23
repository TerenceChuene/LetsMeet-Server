import { describe, expect, it } from 'vitest';
import { serializeMessage } from '../../src/modules/chat/services/chatService.js';

describe('chat serializer', () => {
  it('redacts deleted message bodies', () => {
    const serialized = serializeMessage({
      id: '1',
      meetingId: '2',
      senderId: '3',
      body: 'secret',
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: '3',
      attachmentMeta: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: { id: '3', email: 'a@b.com', profile: { displayName: 'A' } },
    });

    expect(serialized.body).toBeNull();
    expect(serialized.isDeleted).toBe(true);
  });
});
