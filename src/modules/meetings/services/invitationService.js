import { prisma } from '../../../database/prisma.js';
import { AppError } from '../../../utils/AppError.js';
import { env } from '../../../config/env.js';
import { generateOpaqueToken, sha256 } from '../../../utils/crypto.js';
import * as meetingRepo from '../repositories/meetingRepository.js';
import * as participantRepo from '../repositories/participantRepository.js';
import { assertHost } from '../utils/permissions.js';
import { notifyMeetingInvite } from '../../notifications/services/notificationService.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';

function hashInviteToken(token) {
  return sha256(token);
}

export async function createInvitation(meetingId, inviter, payload, context = {}) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  const actor = await participantRepo.findParticipant(meetingId, inviter.id);
  if (meeting.ownerId !== inviter.id) {
    assertHost(actor);
  }

  if (!payload.email && !payload.userId) {
    throw new AppError('email or userId is required', 400, {
      code: 'INVITEE_REQUIRED',
    });
  }

  let invitee = null;
  if (payload.userId) {
    invitee = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      include: { profile: true },
    });
    if (!invitee) {
      throw new AppError('Invitee not found', 404, { code: 'USER_NOT_FOUND' });
    }
  } else if (payload.email) {
    invitee = await prisma.user.findFirst({
      where: { email: payload.email.toLowerCase(), deletedAt: null },
      include: { profile: true },
    });
  }

  const token = generateOpaqueToken(24);
  const invitation = await prisma.meetingInvitation.create({
    data: {
      meetingId,
      inviterId: inviter.id,
      inviteeId: invitee?.id ?? null,
      email: payload.email?.toLowerCase() ?? invitee?.email ?? null,
      status: 'PENDING',
      tokenHash: hashInviteToken(token),
      expiresAt: payload.expiresAt
        ? new Date(payload.expiresAt)
        : new Date(Date.now() + 7 * 86400000),
    },
  });

  await notifyMeetingInvite({
    inviteeUserId: invitee?.id,
    inviteeEmail: invitation.email,
    inviter,
    meeting,
  });

  await writeAuditLog({
    actorId: inviter.id,
    action: 'meeting.invite',
    resource: 'meeting_invitation',
    resourceId: invitation.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId, inviteeId: invitee?.id, email: invitation.email },
  });

  return {
    id: invitation.id,
    meetingId: invitation.meetingId,
    email: invitation.email,
    inviteeId: invitation.inviteeId,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    ...(env.isProduction ? {} : { token }),
  };
}

export async function listInvitations(meetingId, requester) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  const actor = await participantRepo.findParticipant(meetingId, requester.id);
  if (meeting.ownerId !== requester.id) {
    assertHost(actor);
  }

  const invitations = await prisma.meetingInvitation.findMany({
    where: { meetingId },
    orderBy: { createdAt: 'desc' },
  });

  return invitations.map((item) => ({
    id: item.id,
    meetingId: item.meetingId,
    email: item.email,
    inviteeId: item.inviteeId,
    status: item.status,
    expiresAt: item.expiresAt,
    createdAt: item.createdAt,
  }));
}
