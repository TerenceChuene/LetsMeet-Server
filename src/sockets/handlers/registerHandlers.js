import { ZodError } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { isHostRole } from '../../modules/meetings/utils/permissions.js';
import * as participantRepo from '../../modules/meetings/repositories/participantRepository.js';
import * as meetingRepo from '../../modules/meetings/repositories/meetingRepository.js';
import * as participantService from '../../modules/meetings/services/participantService.js';
import * as chatService from '../../modules/chat/services/chatService.js';
import { serializeParticipant } from '../../modules/meetings/serializers/meetingSerializer.js';
import {
  emitChatMessage,
  emitHandRaised,
  emitParticipantJoined,
  emitParticipantLeft,
  emitParticipantMuted,
  emitParticipantRemoved,
  emitParticipantUpdated,
  emitScreenSharing,
  emitWaitingRoomApproved,
  emitWaitingRoomRejected,
  emitWaitingRoomRequest,
} from '../emitters.js';
import {
  meetingRoom,
  meetingWaitingRoom,
  SOCKET_EVENTS,
} from '../events.js';
import {
  chatMessageSchema,
  chatTypingSchema,
  meetingJoinSchema,
  meetingLeaveSchema,
  parseEvent,
  participantRemoveSchema,
  participantUpdateSchema,
  waitingRoomActionSchema,
} from '../validators/socketValidators.js';

function emitSocketError(socket, error) {
  const payload =
    error instanceof AppError
      ? { code: error.code, message: error.message, details: error.details }
      : error instanceof ZodError
        ? {
            code: 'VALIDATION_ERROR',
            message: 'Invalid event payload',
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }
        : {
            code: error?.message || 'SOCKET_ERROR',
            message: error?.message || 'Socket error',
          };

  socket.emit(SOCKET_EVENTS.ERROR, payload);
}

function wrap(socket, handler) {
  return async (payload, ack) => {
    try {
      const result = await handler(payload);
      if (typeof ack === 'function') {
        ack({ ok: true, data: result });
      }
    } catch (error) {
      logger.warn(
        { err: error, userId: socket.data.user?.id, event: handler.name },
        'socket.handler_error',
      );
      emitSocketError(socket, error);
      if (typeof ack === 'function') {
        ack({
          ok: false,
          error:
            error instanceof AppError
              ? { code: error.code, message: error.message }
              : { code: 'SOCKET_ERROR', message: error?.message || 'Socket error' },
        });
      }
    }
  };
}

async function requireMeetingParticipant(meetingId, userId, { allowWaiting = false } = {}) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  const participant = await participantRepo.findParticipant(meetingId, userId);
  const allowed = allowWaiting
    ? ['WAITING', 'ADMITTED', 'JOINED']
    : ['ADMITTED', 'JOINED'];

  if (!participant || !allowed.includes(participant.status)) {
    throw new AppError('Join the meeting before connecting to signalling', 403, {
      code: 'NOT_A_PARTICIPANT',
    });
  }

  return { meeting, participant };
}

export function registerHandlers(io, socket) {
  const user = socket.data.user;

  socket.on(
    SOCKET_EVENTS.MEETING_JOIN,
    wrap(socket, async (payload) => {
      const { meetingId } = parseEvent(meetingJoinSchema, payload);
      const { meeting, participant } = await requireMeetingParticipant(meetingId, user.id, {
        allowWaiting: true,
      });

      socket.data.meetingId = meetingId;
      await socket.join(meetingRoom(meetingId));

      if (isHostRole(participant.role)) {
        await socket.join(meetingWaitingRoom(meetingId));
      }

      if (participant.status === 'WAITING') {
        emitWaitingRoomRequest(meetingId, serializeParticipant(participant));
        return {
          meetingId,
          status: participant.status,
          room: meetingRoom(meetingId),
          waitingRoom: true,
        };
      }

      emitParticipantJoined(meetingId, serializeParticipant(participant));

      return {
        meetingId,
        status: participant.status,
        room: meetingRoom(meetingId),
        meetingStatus: meeting.status,
      };
    }),
  );

  socket.on(
    SOCKET_EVENTS.MEETING_LEAVE,
    wrap(socket, async (payload) => {
      const { meetingId } = parseEvent(meetingLeaveSchema, payload);
      const participant = await participantRepo.findParticipant(meetingId, user.id);

      await socket.leave(meetingRoom(meetingId));
      await socket.leave(meetingWaitingRoom(meetingId));

      if (socket.data.meetingId === meetingId) {
        socket.data.meetingId = undefined;
      }

      if (participant) {
        emitParticipantLeft(meetingId, serializeParticipant(participant));
      }

      return { meetingId, left: true };
    }),
  );

  socket.on(
    SOCKET_EVENTS.PARTICIPANT_UPDATED,
    wrap(socket, async (payload) => {
      const data = parseEvent(participantUpdateSchema, payload);
      const targetUserId = data.userId ?? user.id;
      const { micEnabled, cameraEnabled, screenSharing, handRaised, isMutedByHost, displayName } =
        data;

      const updated = await participantService.updateParticipant(
        data.meetingId,
        targetUserId,
        user,
        {
          ...(micEnabled !== undefined ? { micEnabled } : {}),
          ...(cameraEnabled !== undefined ? { cameraEnabled } : {}),
          ...(screenSharing !== undefined ? { screenSharing } : {}),
          ...(handRaised !== undefined ? { handRaised } : {}),
          ...(isMutedByHost !== undefined ? { isMutedByHost } : {}),
          ...(displayName !== undefined ? { displayName } : {}),
        },
        {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        },
      );

      emitParticipantUpdated(data.meetingId, updated);

      if (isMutedByHost === true) {
        emitParticipantMuted(data.meetingId, updated);
      }
      if (handRaised !== undefined) {
        emitHandRaised(data.meetingId, updated);
      }
      if (screenSharing !== undefined) {
        emitScreenSharing(data.meetingId, updated);
      }

      return updated;
    }),
  );

  socket.on(
    SOCKET_EVENTS.PARTICIPANT_REMOVED,
    wrap(socket, async (payload) => {
      const data = parseEvent(participantRemoveSchema, payload);
      const removed = await participantService.removeParticipant(
        data.meetingId,
        data.userId,
        user,
        {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        },
      );

      emitParticipantRemoved(data.meetingId, removed);

      const sockets = await io.in(meetingRoom(data.meetingId)).fetchSockets();
      await Promise.all(
        sockets
          .filter((s) => s.data.user?.id === data.userId)
          .map(async (s) => {
            s.emit(SOCKET_EVENTS.PARTICIPANT_REMOVED, {
              meetingId: data.meetingId,
              participant: removed,
              at: new Date().toISOString(),
            });
            await s.leave(meetingRoom(data.meetingId));
            await s.leave(meetingWaitingRoom(data.meetingId));
          }),
      );

      return removed;
    }),
  );

  socket.on(
    SOCKET_EVENTS.CHAT_MESSAGE,
    wrap(socket, async (payload) => {
      const data = parseEvent(chatMessageSchema, payload);
      const message = await chatService.createMeetingMessage(data.meetingId, user, {
        body: data.body,
        attachmentMeta: data.attachmentMeta,
      });
      emitChatMessage(data.meetingId, message);
      return message;
    }),
  );

  socket.on(
    SOCKET_EVENTS.CHAT_TYPING,
    wrap(socket, async (payload) => {
      const data = parseEvent(chatTypingSchema, payload);
      await requireMeetingParticipant(data.meetingId, user.id);

      socket.to(meetingRoom(data.meetingId)).emit(SOCKET_EVENTS.CHAT_TYPING, {
        meetingId: data.meetingId,
        userId: user.id,
        displayName: user.profile?.displayName ?? user.email,
        isTyping: data.isTyping,
        at: new Date().toISOString(),
      });

      return { ok: true };
    }),
  );

  socket.on(
    SOCKET_EVENTS.WAITING_ROOM_APPROVED,
    wrap(socket, async (payload) => {
      const data = parseEvent(waitingRoomActionSchema, payload);
      const approved = await participantService.approveWaitingParticipant(
        data.meetingId,
        data.userId,
        user,
        {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        },
      );

      const { media, ...participant } = approved;
      emitWaitingRoomApproved(data.meetingId, participant);
      emitParticipantJoined(data.meetingId, participant);
      return { participant, media };
    }),
  );

  socket.on(
    SOCKET_EVENTS.WAITING_ROOM_REJECTED,
    wrap(socket, async (payload) => {
      const data = parseEvent(waitingRoomActionSchema, payload);
      const rejected = await participantService.rejectWaitingParticipant(
        data.meetingId,
        data.userId,
        user,
        {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        },
      );

      emitWaitingRoomRejected(data.meetingId, rejected);
      return rejected;
    }),
  );

  socket.on('disconnect', async (reason) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return;

    logger.info(
      { userId: user.id, meetingId, reason },
      'socket.disconnected',
    );

    const participant = await participantRepo.findParticipant(meetingId, user.id);
    if (participant && ['JOINED', 'ADMITTED', 'WAITING'].includes(participant.status)) {
      emitParticipantLeft(meetingId, serializeParticipant(participant));
    }
  });
}
