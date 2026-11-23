import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { AppError } from '../../../utils/AppError.js';
import { issueMediaTokenForUser } from '../services/livekitMeetingService.js';
import {
  processWebhookEvent,
  receiveWebhook,
} from '../services/webhookService.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';

export const createToken = asyncHandler(async (req, res) => {
  const data = await issueMediaTokenForUser(req.body.meetingId, req.user);

  await writeAuditLog({
    actorId: req.user.id,
    action: 'livekit.token_issued',
    resource: 'meeting',
    resourceId: req.body.meetingId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({ success: true, data });
});

export const handleWebhook = asyncHandler(async (req, res) => {
  const rawBody =
    typeof req.rawBody === 'string'
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});

  const authHeader = req.get('Authorization') || req.get('Authorize');

  let event;
  try {
    event = await receiveWebhook(rawBody, authHeader);
  } catch (error) {
    throw new AppError('Invalid LiveKit webhook signature', 401, {
      code: 'INVALID_WEBHOOK_SIGNATURE',
      details: error instanceof Error ? error.message : undefined,
    });
  }

  const result = await processWebhookEvent(event);

  res.status(200).json({
    success: true,
    data: {
      event: event.event,
      ...result,
    },
  });
});
