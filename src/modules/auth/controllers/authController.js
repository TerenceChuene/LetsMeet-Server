import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as authService from '../services/authService.js';
import {
  clearRefreshCookie,
  readRefreshToken,
  setRefreshCookie,
} from '../services/authCookies.js';

function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

function sendAuthSuccess(res, status, result) {
  if (result.refreshToken) {
    setRefreshCookie(res, result.refreshToken);
  }

  res.status(status).json({
    success: true,
    data: result,
  });
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestContext(req));
  sendAuthSuccess(res, 201, result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, requestContext(req));
  sendAuthSuccess(res, 200, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req);
  const result = await authService.refresh(token, requestContext(req));
  sendAuthSuccess(res, 200, result);
});

export const logout = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req);
  const result = await authService.logout(token, requestContext(req));
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: result });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body, requestContext(req));
  res.status(200).json({ success: true, data: result });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body, requestContext(req));
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: result });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.body?.token || req.query?.token;
  const result = await authService.verifyEmail({ token }, requestContext(req));
  res.status(200).json({ success: true, data: result });
});
