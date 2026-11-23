import { prisma } from '../../../database/prisma.js';
import { AppError } from '../../../utils/AppError.js';
import { env } from '../../../config/env.js';
import {
  sendMeetingInviteEmail,
  sendMeetingReminderEmail,
} from '../../../infrastructure/email/emailService.js';
import { logger } from '../../../infrastructure/logging/logger.js';

export function serializeNotification(notification) {
  return {
    id: notification.id,
    userId: notification.userId,
    channel: notification.channel,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    status: notification.status,
    payload: notification.payload,
    readAt: notification.readAt,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
  };
}

async function getUserSettings(userId) {
  return prisma.userSettings.findUnique({ where: { userId } });
}

export async function createNotification({
  userId,
  type,
  title,
  body,
  payload = {},
  channel = 'IN_APP',
}) {
  const settings = await getUserSettings(userId);

  if (channel === 'IN_APP' && settings && settings.inAppNotifications === false) {
    return null;
  }
  if (channel === 'EMAIL' && settings && settings.emailNotifications === false) {
    return null;
  }

  return prisma.notification.create({
    data: {
      userId,
      channel,
      type,
      title,
      body,
      payload,
      status: 'PENDING',
    },
  });
}

export async function deliverInAppNotification(input) {
  const notification = await createNotification({ ...input, channel: 'IN_APP' });
  if (!notification) return null;

  return prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

export async function deliverEmailNotification(input, sendFn) {
  const settings = await getUserSettings(input.userId);
  if (settings && settings.emailNotifications === false) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) return null;

  const notification = await createNotification({
    ...input,
    channel: 'EMAIL',
  });
  if (!notification) return null;

  try {
    await sendFn(user.email);
    return prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (error) {
    logger.error({ err: error, notificationId: notification.id }, 'notification.email_failed');
    return prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED' },
    });
  }
}

export async function notifyMeetingInvite({
  inviteeUserId,
  inviteeEmail,
  inviter,
  meeting,
}) {
  const joinUrl = `${env.APP_URL}/meetings/${meeting.code}`;
  const title = `Invitation: ${meeting.title}`;
  const body = `${inviter.profile?.displayName ?? inviter.email} invited you to ${meeting.title}`;

  if (inviteeUserId) {
    await deliverInAppNotification({
      userId: inviteeUserId,
      type: 'meeting.invitation',
      title,
      body,
      payload: {
        meetingId: meeting.id,
        code: meeting.code,
        inviterId: inviter.id,
      },
    });

    await deliverEmailNotification(
      {
        userId: inviteeUserId,
        type: 'meeting.invitation',
        title,
        body,
        payload: { meetingId: meeting.id, code: meeting.code },
      },
      (email) =>
        sendMeetingInviteEmail(email, {
          meetingTitle: meeting.title,
          meetingCode: meeting.code,
          joinUrl,
        }),
    );
  } else if (inviteeEmail) {
    await sendMeetingInviteEmail(inviteeEmail, {
      meetingTitle: meeting.title,
      meetingCode: meeting.code,
      joinUrl,
    });
  }
}

export async function notifyMeetingReminder({ userId, meeting }) {
  const settings = await getUserSettings(userId);
  if (settings && settings.meetingReminders === false) {
    return null;
  }

  const startsAt = meeting.scheduledStartAt?.toISOString?.() ?? String(meeting.scheduledStartAt);
  const joinUrl = `${env.APP_URL}/meetings/${meeting.code}`;
  const title = `Reminder: ${meeting.title}`;
  const body = `${meeting.title} is starting soon`;

  await deliverInAppNotification({
    userId,
    type: 'meeting.reminder',
    title,
    body,
    payload: { meetingId: meeting.id, code: meeting.code, startsAt },
  });

  return deliverEmailNotification(
    {
      userId,
      type: 'meeting.reminder',
      title,
      body,
      payload: { meetingId: meeting.id, startsAt },
    },
    (email) =>
      sendMeetingReminderEmail(email, {
        meetingTitle: meeting.title,
        startsAt,
        joinUrl,
      }),
  );
}

export async function notifyParticipantEvent({ userId, type, title, body, payload }) {
  return deliverInAppNotification({ userId, type, title, body, payload });
}

export async function listNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  return notifications.map(serializeNotification);
}

export async function markNotificationRead(userId, notificationId) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new AppError('Notification not found', 404, { code: 'NOTIFICATION_NOT_FOUND' });
  }

  if (notification.readAt) {
    return serializeNotification(notification);
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      readAt: new Date(),
      status: 'READ',
    },
  });

  return serializeNotification(updated);
}

export async function markAllNotificationsRead(userId) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: {
      readAt: new Date(),
      status: 'READ',
    },
  });

  return { success: true };
}
