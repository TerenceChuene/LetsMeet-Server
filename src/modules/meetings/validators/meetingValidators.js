import { z } from 'zod';

const uuid = z.string().uuid();

export const createMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    password: z.string().min(4).max(64).optional(),
    waitingRoomEnabled: z.boolean().optional(),
    scheduledStartAt: z.coerce.date().optional(),
    scheduledEndAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    maxParticipants: z.number().int().min(2).max(500).optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) =>
      !data.scheduledStartAt ||
      !data.scheduledEndAt ||
      data.scheduledEndAt > data.scheduledStartAt,
    { message: 'scheduledEndAt must be after scheduledStartAt', path: ['scheduledEndAt'] },
  );

export const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    password: z.string().min(4).max(64).nullable().optional(),
    waitingRoomEnabled: z.boolean().optional(),
    scheduledStartAt: z.coerce.date().nullable().optional(),
    scheduledEndAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    maxParticipants: z.number().int().min(2).max(500).nullable().optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const meetingIdParamSchema = z.object({
  id: uuid,
});

export const joinMeetingSchema = z.object({
  password: z.string().min(1).max(64).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const joinByCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/, 'Invalid meeting code format'),
  password: z.string().min(1).max(64).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const listMeetingsQuerySchema = z.object({
  status: z
    .enum(['SCHEDULED', 'WAITING', 'LIVE', 'ENDED', 'CANCELLED', 'EXPIRED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().uuid().optional(),
});

export const participantUserParamSchema = z.object({
  id: uuid,
  userId: uuid,
});

export const updateParticipantSchema = z
  .object({
    role: z.enum(['HOST', 'CO_HOST', 'PARTICIPANT']).optional(),
    micEnabled: z.boolean().optional(),
    cameraEnabled: z.boolean().optional(),
    screenSharing: z.boolean().optional(),
    handRaised: z.boolean().optional(),
    isMutedByHost: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    permissions: z.record(z.boolean()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const waitingRoomActionSchema = z.object({
  id: uuid,
  userId: uuid,
});
