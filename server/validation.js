const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
});

const voteSchema = z.object({
  userId: z.string().uuid(),
  showdownId: z.string().uuid(),
  choice: z.enum(['RED', 'BLUE']),
});

module.exports = { registerSchema, voteSchema };
