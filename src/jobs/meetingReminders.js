import { prisma } from '../database/prisma.js';
import { logger } from '../infrastructure/logging/logger.js';
import { notifyMeetingReminder } from '../modules/notifications/services/notificationService.js';

/**
 * Send reminders for meetings starting within the next `windowMinutes`.
 * Intended to be invoked by a cron / scheduler process.
 */
export async function sendUpcomingMeetingReminders(windowMinutes = 15) {
  const now = new Date();
  const until = new Date(now.getTime() + windowMinutes * 60_000);

  const meetings = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SCHEDULED', 'WAITING'] },
      scheduledStartAt: {
        gte: now,
        lte: until,
      },
    },
    include: {
      participants: {
        where: {
          status: { in: ['INVITED', 'WAITING', 'ADMITTED', 'JOINED'] },
        },
        select: { userId: true },
      },
    },
  });

  let sent = 0;

  for (const meeting of meetings) {
    const recipients = new Set([
      meeting.ownerId,
      ...meeting.participants.map((p) => p.userId),
    ]);

    for (const userId of recipients) {
      try {
        await notifyMeetingReminder({ userId, meeting });
        sent += 1;
      } catch (error) {
        logger.warn(
          { err: error, meetingId: meeting.id, userId },
          'reminder.send_failed',
        );
      }
    }
  }

  logger.info({ meetings: meetings.length, sent }, 'reminders.completed');
  return { meetings: meetings.length, sent };
}
