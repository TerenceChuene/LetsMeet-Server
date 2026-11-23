import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as invitationService from '../services/invitationService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const createInvitation = asyncHandler(async (req, res) => {
  const data = await invitationService.createInvitation(
    req.params.id,
    req.user,
    req.body,
    requestContext(req),
  );
  res.status(201).json({ success: true, data });
});

export const listInvitations = asyncHandler(async (req, res) => {
  const data = await invitationService.listInvitations(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});
