import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as meetingService from '../services/meetingService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const createMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.createMeeting(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data });
});

export const listMeetings = asyncHandler(async (req, res) => {
  const data = await meetingService.listMeetings(req.user.id, req.query);
  res.status(200).json({ success: true, data });
});

export const getMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.getMeeting(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});

export const updateMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.updateMeeting(
    req.params.id,
    req.user,
    req.body,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const startMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.startMeeting(
    req.params.id,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const endMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.endMeeting(
    req.params.id,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const joinMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.joinMeeting(
    req.params.id,
    req.user,
    req.body,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const joinByCode = asyncHandler(async (req, res) => {
  const data = await meetingService.joinMeetingByCode(
    req.user,
    req.body,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const leaveMeeting = asyncHandler(async (req, res) => {
  const data = await meetingService.leaveMeeting(
    req.params.id,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});
