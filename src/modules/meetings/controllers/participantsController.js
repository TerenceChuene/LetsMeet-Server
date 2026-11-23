import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as participantService from '../services/participantService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const listParticipants = asyncHandler(async (req, res) => {
  const data = await participantService.listParticipants(req.params.id, req.user, {
    status: req.query.status,
  });
  res.status(200).json({ success: true, data });
});

export const updateParticipant = asyncHandler(async (req, res) => {
  const data = await participantService.updateParticipant(
    req.params.id,
    req.params.userId,
    req.user,
    req.body,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const removeParticipant = asyncHandler(async (req, res) => {
  const data = await participantService.removeParticipant(
    req.params.id,
    req.params.userId,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const listWaitingRoom = asyncHandler(async (req, res) => {
  const data = await participantService.listWaitingRoom(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});

export const approveWaiting = asyncHandler(async (req, res) => {
  const data = await participantService.approveWaitingParticipant(
    req.params.id,
    req.params.userId,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const rejectWaiting = asyncHandler(async (req, res) => {
  const data = await participantService.rejectWaitingParticipant(
    req.params.id,
    req.params.userId,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});
