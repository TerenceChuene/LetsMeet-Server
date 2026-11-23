import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as chatService from '../services/chatService.js';
import { emitChatMessage } from '../../../sockets/emitters.js';
import { SOCKET_EVENTS } from '../../../sockets/events.js';
import { getIO } from '../../../sockets/io.js';
import { meetingRoom } from '../../../sockets/events.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const listMessages = asyncHandler(async (req, res) => {
  const data = await chatService.listMeetingMessages(req.params.id, req.user.id, {
    limit: Number(req.query.limit) || 50,
    before: req.query.before,
  });
  res.status(200).json({ success: true, data });
});

export const createMessage = asyncHandler(async (req, res) => {
  const message = await chatService.createMeetingMessage(req.params.id, req.user, {
    body: req.body.body,
    attachmentMeta: req.body.attachmentMeta,
  });
  emitChatMessage(req.params.id, message);
  res.status(201).json({ success: true, data: message });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await chatService.deleteMeetingMessage(
    req.params.id,
    req.params.messageId,
    req.user,
    requestContext(req),
  );

  const io = getIO();
  if (io) {
    io.to(meetingRoom(req.params.id)).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
      meetingId: req.params.id,
      message,
      deleted: true,
      at: new Date().toISOString(),
    });
  }

  res.status(200).json({ success: true, data: message });
});
