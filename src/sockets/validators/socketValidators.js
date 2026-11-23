import { z } from 'zod';

const uuid = z.string().uuid();

export const meetingJoinSchema = z.object({
  meetingId: uuid,
});

export const meetingLeaveSchema = z.object({
  meetingId: uuid,
});

export const participantUpdateSchema = z
  .object({
    meetingId: uuid,
    userId: uuid.optional(),
    micEnabled: z.boolean().optional(),
    cameraEnabled: z.boolean().optional(),
    screenSharing: z.boolean().optional(),
    handRaised: z.boolean().optional(),
    isMutedByHost: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (data) =>
      data.micEnabled !== undefined ||
      data.cameraEnabled !== undefined ||
      data.screenSharing !== undefined ||
      data.handRaised !== undefined ||
      data.isMutedByHost !== undefined ||
      data.displayName !== undefined,
    { message: 'At least one participant field is required' },
  );

export const participantRemoveSchema = z.object({
  meetingId: uuid,
  userId: uuid,
});

export const chatMessageSchema = z.object({
  meetingId: uuid,
  body: z.string().trim().min(1).max(4000),
  attachmentMeta: z.record(z.unknown()).optional(),
});

export const chatTypingSchema = z.object({
  meetingId: uuid,
  isTyping: z.boolean(),
});

export const waitingRoomActionSchema = z.object({
  meetingId: uuid,
  userId: uuid,
});

export function parseEvent(schema, payload) {
  return schema.parse(payload ?? {});
}
