import { z } from 'zod';

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachmentMeta: z.record(z.unknown()).optional(),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});
