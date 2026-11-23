import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as adminService from '../services/adminService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const getDashboard = asyncHandler(async (_req, res) => {
  const data = await adminService.getDashboard();
  res.status(200).json({ success: true, data });
});

export const listUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listUsers(req.query);
  res.status(200).json({ success: true, data });
});

export const getUser = asyncHandler(async (req, res) => {
  const data = await adminService.getUser(req.params.id);
  res.status(200).json({ success: true, data });
});

export const suspendUser = asyncHandler(async (req, res) => {
  const data = await adminService.suspendUser(
    req.user,
    req.params.id,
    req.body,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const activateUser = asyncHandler(async (req, res) => {
  const data = await adminService.activateUser(
    req.user,
    req.params.id,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const data = await adminService.updateUserRole(
    req.user,
    req.params.id,
    req.body.globalRole,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const listMeetings = asyncHandler(async (req, res) => {
  const data = await adminService.listMeetings(req.query);
  res.status(200).json({ success: true, data });
});

export const forceEndMeeting = asyncHandler(async (req, res) => {
  const data = await adminService.forceEndMeeting(
    req.user,
    req.params.id,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.listAuditLogs(req.query);
  res.status(200).json({ success: true, data });
});

export const getSystemHealth = asyncHandler(async (_req, res) => {
  const data = await adminService.getSystemHealth();
  res.status(data.status === 'ok' ? 200 : 503).json({ success: data.status === 'ok', data });
});
