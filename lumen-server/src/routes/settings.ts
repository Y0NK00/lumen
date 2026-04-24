import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getUserById } from '../db/repos/users.js';
import { db } from '../db/connection.js';
import { logger } from '../lib/logger.js';

// Allowed top-level settings keys — acts as an allow-list to prevent junk
const settingsPatchSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultModel: z.enum(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']).optional(),
  sendOnEnter: z.boolean().optional(),
  showTokenCounts: z.boolean().optional(),
  showCostEstimates: z.boolean().optional(),
  compactMessages: z.boolean().optional(),
  // Extension to unknown keys for future-proofing — extra keys are stripped
}).catchall(z.unknown());

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings  — return current user's settings blob
  app.get('/api/settings', { preHandler: requireAuth }, async (req, reply) => {
    const user = getUserById(req.auth!.userId);
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    return reply.send({
      settings: user.settings,
      monthlyBudgetUsd: user.monthlyBudgetUsd,
      budgetAlertThreshold: user.budgetAlertThreshold,
    });
  });

  // PATCH /api/settings  — deep-merge provided keys into settings_json
  app.patch('/api/settings', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = settingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }

    const userId = req.auth!.userId;
    const user = getUserById(userId);
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    // Deep merge: existing settings + new keys
    const merged = { ...user.settings, ...parsed.data };

    db.prepare(
      `UPDATE users SET settings_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(merged), userId);

    logger.info({ userId }, 'settings.updated');
    return reply.send({ settings: merged });
  });
}
