import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

let transporter;

function getTransporter() {
  if (!env.SMTP_HOST) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: Number(env.SMTP_PORT) === 465,
      auth:
        env.SMTP_USER
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  const payload = {
    from: env.EMAIL_FROM ?? `noreply@${env.APP_NAME}.local`,
    to,
    subject,
    text,
    html,
  };

  const mailer = getTransporter();

  if (!mailer) {
    logger.info({ email: payload }, 'email.dev_log');
    return { queued: false, logged: true, ...payload };
  }

  try {
    const info = await mailer.sendMail(payload);
    logger.info({ to, subject, messageId: info.messageId }, 'email.sent');
    return { queued: true, messageId: info.messageId, ...payload };
  } catch (error) {
    logger.error({ err: error, to, subject }, 'email.send_failed');
    throw error;
  }
}

export async function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your LetsMeet password',
    text: `Reset your password using this link (expires soon):\n\n${resetUrl}\n`,
    html: `<p>Reset your password using this link (expires soon):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}

export async function sendEmailVerification(to, verifyUrl) {
  return sendEmail({
    to,
    subject: 'Verify your LetsMeet email',
    text: `Verify your email:\n\n${verifyUrl}\n`,
    html: `<p>Verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
}

export async function sendMeetingInviteEmail(to, { meetingTitle, meetingCode, joinUrl }) {
  return sendEmail({
    to,
    subject: `You're invited: ${meetingTitle}`,
    text: `You have been invited to "${meetingTitle}".\nMeeting code: ${meetingCode}\nJoin: ${joinUrl}\n`,
    html: `<p>You have been invited to <strong>${meetingTitle}</strong>.</p><p>Meeting code: <code>${meetingCode}</code></p><p><a href="${joinUrl}">Join meeting</a></p>`,
  });
}

export async function sendMeetingReminderEmail(to, { meetingTitle, startsAt, joinUrl }) {
  return sendEmail({
    to,
    subject: `Reminder: ${meetingTitle}`,
    text: `"${meetingTitle}" starts at ${startsAt}.\nJoin: ${joinUrl}\n`,
    html: `<p><strong>${meetingTitle}</strong> starts at ${startsAt}.</p><p><a href="${joinUrl}">Join meeting</a></p>`,
  });
}
