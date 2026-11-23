import { asyncHandler } from '../../../middleware/asyncHandler.js';
import * as notificationService from '../services/notificationService.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const data = await notificationService.listNotifications(req.user.id, {
    unreadOnly: req.query.unreadOnly === 'true',
    limit: Number(req.query.limit) || 50,
  });
  res.status(200).json({ success: true, data });
});

export const markRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markNotificationRead(
    req.user.id,
    req.params.id,
  );
  res.status(200).json({ success: true, data });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllNotificationsRead(req.user.id);
  res.status(200).json({ success: true, data });
});
