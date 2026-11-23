import { z } from 'zod';

export const livekitTokenSchema = z.object({
  meetingId: z.string().uuid('Valid meetingId is required'),
});
