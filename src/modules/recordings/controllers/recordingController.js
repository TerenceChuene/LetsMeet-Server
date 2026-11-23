import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as recordingService from '../services/recordingService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const startRecording = asyncHandler(async (req, res) => {
  const data = await recordingService.startRecording(
    req.params.id,
    req.user,
    requestContext(req),
  );
  res.status(201).json({ success: true, data });
});

export const stopRecording = asyncHandler(async (req, res) => {
  const data = await recordingService.stopRecording(
    req.params.id,
    req.user,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const listRecordings = asyncHandler(async (req, res) => {
  const data = await recordingService.listRecordingsForUser(req.user.id, {
    meetingId: req.query.meetingId,
    limit: Number(req.query.limit) || 50,
  });
  res.status(200).json({ success: true, data });
});

export const getRecordingDownload = asyncHandler(async (req, res) => {
  const data = await recordingService.getRecordingDownload(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});
