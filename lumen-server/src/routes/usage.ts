import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getMonthlySummary } from '../db/repos/usage.js';
import { getUserById } from '../db/repos/users.js';
import { db } from '../db/connection.js';

const summaryQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
});

const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(), // usage event id — paginates after this row
});

export async function usageRoutes(app: FastifyInstance) {
  // GET /api/usage/summary?month=YYYY-MM
  // Defaults to the current calendar month if ?month is omitted.
  app.get('/api/usage/summary', { preHandler: requireAuth }, async (req, reply) => {
    const q = summaryQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: q.error.message } });
    }

    const yyyymm = q.data.month ?? new Date().toISOString().slice(0, 7);
    const userId = req.auth!.userId;

    const summary = getMonthlySummary(userId, yyyymm);
    const user = getUserById(userId);

    return reply.send({
      ...summary,
      monthlyBudgetUsd: user?.monthlyBudgetUsd ?? null,
      budgetAlertThreshold: user?.budgetAlertThreshold ?? null,
    });
  });

  // GET /api/usage/events?limit=50&cursor=e_xxx
  // Returns raw usage events newest-first, cursor-paginated.
  app.get('/api/usage/events', { preHandler: requireAuth }, async (req, reply) => {
    const q = eventsQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: q.error.message } });
    }

    const userId = req.auth!.userId;
    const limit = Math.min(q.data.limit ?? 50, 200);

    type EventRow = {
      id: string;
      user_id: string;
      conversation_id: string | null;
      message_id: string | null;
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      cost_usd: number;
      created_at: string;
    };

    let sql = `SELECT * FROM usage_events WHERE user_id = ?`;
    const params: unknown[] = [userId];

    if (q.data.cursor) {
      // Page after the cursor row's created_at (DESC order)
      sql += ` AND created_at < (SELECT created_at FROM usage_events WHERE id = ?)`;
      params.push(q.data.cursor);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as EventRow[];

    const items = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      messageId: r.message_id,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheWriteTokens: r.cache_write_tokens,
      costUsd: r.cost_usd,
      createdAt: r.created_at,
    }));

    const nextCursor = items.length === limit ? items[items.length - 1]?.id : null;
    return reply.send({ items, nextCursor });
  });
}
