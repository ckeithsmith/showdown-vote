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

const sfIngestSchema = z.object({
  contest: z
    .object({
      id: z.string().min(15).max(18),
      name: z.string().optional().nullable(),
      status: z.string().optional().nullable(),
      currentRound: z.string().optional().nullable(),
      activeShowdownId: z.string().min(15).max(18).optional().nullable(),
      judgingModel: z.string().optional().nullable(),
      resultsVisibility: z.string().optional().nullable(),
    })
    .strict(),
  showdown: z
    .object({
      id: z.string().min(15).max(18),
      status: z.string().optional().nullable(),
      round: z.string().optional().nullable(),
      matchNumber: z.string().optional().nullable(),
      voteOpenTime: z.string().datetime().optional().nullable(),
      voteCloseTime: z.string().datetime().optional().nullable(),
      red: z
        .object({
          coupleId: z.string().min(15).max(18).optional().nullable(),
          leadId: z.string().min(15).max(18).optional().nullable(),
          followId: z.string().min(15).max(18).optional().nullable(),
          leadName: z.string().optional().nullable(),
          followName: z.string().optional().nullable(),
        })
        .strict(),
      blue: z
        .object({
          coupleId: z.string().min(15).max(18).optional().nullable(),
          leadId: z.string().min(15).max(18).optional().nullable(),
          followId: z.string().min(15).max(18).optional().nullable(),
          leadName: z.string().optional().nullable(),
          followName: z.string().optional().nullable(),
        })
        .strict(),
      winner: z.enum(['RED', 'BLUE']).optional().nullable(),
      redAudienceVotes: z.number().optional().nullable(),
      blueAudienceVotes: z.number().optional().nullable(),
    })
    .strict(),
});

module.exports = { registerSchema, voteSchema, sfIngestSchema };
