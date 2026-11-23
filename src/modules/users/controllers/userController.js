import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as userService from '../services/userService.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const getMe = asyncHandler(async (req, res) => {
  const data = await userService.getMe(req.user);
  res.status(200).json({ success: true, data });
});

export const updateMe = asyncHandler(async (req, res) => {
  const data = await userService.updateMe(req.user.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data });
});

export const getUserById = asyncHandler(async (req, res) => {
  const data = await userService.getUserById(req.params.id, req.user);
  res.status(200).json({ success: true, data });
});

export const searchUsers = asyncHandler(async (req, res) => {
  const data = await userService.search(req.query.q, Number(req.query.limit) || 20);
  res.status(200).json({ success: true, data });
});
