import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import {
  createMeeting,
  endMeeting,
  getMeeting,
  joinByCode,
  joinMeeting,
  leaveMeeting,
  listMeetings,
  startMeeting,
  updateMeeting,
} from '../controllers/meetingsController.js';
import {
  approveWaiting,
  listParticipants,
  listWaitingRoom,
  rejectWaiting,
  removeParticipant,
  updateParticipant,
} from '../controllers/participantsController.js';
import {
  createMeetingSchema,
  joinByCodeSchema,
  joinMeetingSchema,
  listMeetingsQuerySchema,
  meetingIdParamSchema,
  participantUserParamSchema,
  updateMeetingSchema,
  updateParticipantSchema,
  waitingRoomActionSchema,
} from '../validators/meetingValidators.js';
import {
  createMessage,
  deleteMessage,
  listMessages,
} from '../../chat/controllers/chatController.js';
import {
  createMessageSchema,
  listMessagesQuerySchema,
} from '../../chat/validators/chatValidators.js';
import {
  createInvitation,
  listInvitations,
} from '../controllers/invitationController.js';
import {
  startRecording,
  stopRecording,
} from '../../recordings/controllers/recordingController.js';
import { z } from 'zod';

const router = Router();

const inviteSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.string().uuid().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((data) => Boolean(data.email || data.userId), {
    message: 'email or userId is required',
  });

router.use(authenticate);

router.post('/', validate(createMeetingSchema), createMeeting);
router.get('/', validate(listMeetingsQuerySchema, 'query'), listMeetings);
router.post('/join', validate(joinByCodeSchema), joinByCode);

router.get('/:id', validate(meetingIdParamSchema, 'params'), getMeeting);
router.patch(
  '/:id',
  validate(meetingIdParamSchema, 'params'),
  validate(updateMeetingSchema),
  updateMeeting,
);
router.post('/:id/start', validate(meetingIdParamSchema, 'params'), startMeeting);
router.post('/:id/end', validate(meetingIdParamSchema, 'params'), endMeeting);
router.post(
  '/:id/join',
  validate(meetingIdParamSchema, 'params'),
  validate(joinMeetingSchema),
  joinMeeting,
);
router.post('/:id/leave', validate(meetingIdParamSchema, 'params'), leaveMeeting);

router.get(
  '/:id/participants',
  validate(meetingIdParamSchema, 'params'),
  listParticipants,
);
router.patch(
  '/:id/participants/:userId',
  validate(participantUserParamSchema, 'params'),
  validate(updateParticipantSchema),
  updateParticipant,
);
router.post(
  '/:id/participants/:userId/remove',
  validate(participantUserParamSchema, 'params'),
  removeParticipant,
);

router.get(
  '/:id/waiting-room',
  validate(meetingIdParamSchema, 'params'),
  listWaitingRoom,
);
router.post(
  '/:id/waiting-room/:userId/approve',
  validate(waitingRoomActionSchema, 'params'),
  approveWaiting,
);
router.post(
  '/:id/waiting-room/:userId/reject',
  validate(waitingRoomActionSchema, 'params'),
  rejectWaiting,
);

router.get(
  '/:id/messages',
  validate(meetingIdParamSchema, 'params'),
  validate(listMessagesQuerySchema, 'query'),
  listMessages,
);
router.post(
  '/:id/messages',
  validate(meetingIdParamSchema, 'params'),
  validate(createMessageSchema),
  createMessage,
);
router.delete(
  '/:id/messages/:messageId',
  validate(
    z.object({
      id: z.string().uuid(),
      messageId: z.string().uuid(),
    }),
    'params',
  ),
  deleteMessage,
);

router.get('/:id/invitations', validate(meetingIdParamSchema, 'params'), listInvitations);
router.post(
  '/:id/invitations',
  validate(meetingIdParamSchema, 'params'),
  validate(inviteSchema),
  createInvitation,
);

router.post(
  '/:id/recordings/start',
  validate(meetingIdParamSchema, 'params'),
  startRecording,
);
router.post(
  '/:id/recordings/stop',
  validate(meetingIdParamSchema, 'params'),
  stopRecording,
);

export default router;
