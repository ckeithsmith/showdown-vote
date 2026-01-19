const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
});

const voteSchema = z.object({
  userId: z.string().uuid(),
  showdownId: z.string().min(15).max(18),
  choice: z.enum(['RED', 'BLUE']),
});

const ingestStateSchema = z
  .record(z.unknown())
  .refine((v) => v && typeof v === 'object' && !Array.isArray(v), 'object');

module.exports = { registerSchema, voteSchema, ingestStateSchema };
