import { prisma } from '../../../database/prisma.js';
import { AppError } from '../../../utils/AppError.js';
import * as participantRepo from '../../meetings/repositories/participantRepository.js';
import * as meetingRepo from '../../meetings/repositories/meetingRepository.js';
import { isHostRole } from '../../meetings/utils/permissions.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';

export function serializeMessage(message) {
  return {
    id: message.id,
    meetingId: message.meetingId,
    senderId: message.senderId,
    body: message.isDeleted ? null : message.body,
    isDeleted: message.isDeleted,
    deletedAt: message.deletedAt,
    deletedById: message.deletedById,
    attachmentMeta: message.attachmentMeta,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sender: message.sender
      ? {
          id: message.sender.id,
          displayName: message.sender.profile?.displayName ?? null,
          email: message.sender.email,
        }
      : undefined,
  };
}

async function assertJoinedParticipant(meetingId, userId) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  if (['CANCELLED', 'EXPIRED'].includes(meeting.status)) {
    throw new AppError('Meeting is not available for chat', 409, {
      code: 'MEETING_CLOSED',
    });
  }

  const participant = await participantRepo.findParticipant(meetingId, userId);
  if (!participant || !['JOINED', 'ADMITTED'].includes(participant.status)) {
    // Allow reading history after leave for ended meetings if user was a participant once
    if (meeting.status === 'ENDED' && participant) {
      return { meeting, participant };
    }
    throw new AppError('Join the meeting before chatting', 403, {
      code: 'CHAT_FORBIDDEN',
    });
  }

  return { meeting, participant };
}

export async function createMeetingMessage(meetingId, sender, { body, attachmentMeta }) {
  const { meeting } = await assertJoinedParticipant(meetingId, sender.id);

  if (['ENDED', 'CANCELLED', 'EXPIRED'].includes(meeting.status)) {
    throw new AppError('Cannot send messages to a closed meeting', 409, {
      code: 'MEETING_CLOSED',
    });
  }

  const message = await prisma.chatMessage.create({
    data: {
      meetingId,
      senderId: sender.id,
      body,
      attachmentMeta: attachmentMeta ?? undefined,
    },
    include: {
      sender: { include: { profile: true } },
    },
  });

  return serializeMessage(message);
}

export async function listMeetingMessages(meetingId, userId, { limit = 50, before } = {}) {
  await assertJoinedParticipant(meetingId, userId);

  const messages = await prisma.chatMessage.findMany({
    where: {
      meetingId,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    include: {
      sender: { include: { profile: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  return messages.reverse().map(serializeMessage);
}

export async function deleteMeetingMessage(meetingId, messageId, actor, context = {}) {
  const { participant } = await assertJoinedParticipant(meetingId, actor.id);

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, meetingId },
  });

  if (!message || message.isDeleted) {
    throw new AppError('Message not found', 404, { code: 'MESSAGE_NOT_FOUND' });
  }

  const canModerate = isHostRole(participant.role);
  const isOwner = message.senderId === actor.id;

  if (!isOwner && !canModerate) {
    throw new AppError('Insufficient permissions to delete this message', 403, {
      code: 'FORBIDDEN',
    });
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: actor.id,
      body: '',
    },
    include: {
      sender: { include: { profile: true } },
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    action: canModerate && !isOwner ? 'chat.moderate_delete' : 'chat.delete',
    resource: 'chat_message',
    resourceId: messageId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId },
  });

  return serializeMessage(updated);
}
