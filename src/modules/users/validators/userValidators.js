import { z } from 'zod';

export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    locale: z.string().trim().min(2).max(16).optional(),
    settings: z
      .object({
        emailNotifications: z.boolean().optional(),
        meetingReminders: z.boolean().optional(),
        inAppNotifications: z.boolean().optional(),
        defaultMuteMicrophone: z.boolean().optional(),
        defaultDisableCamera: z.boolean().optional(),
        preferences: z.record(z.unknown()).optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user id'),
});
