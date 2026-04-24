import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface RecordUsageInput {
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export function recordUsage(input: RecordUsageInput): string {
  const id = `e_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO usage_events
      (id, user_id, conversation_id, message_id, model,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.conversationId,
    input.messageId,
    input.model,
    input.inputTokens,
    input.outputTokens,
    input.cacheReadTokens,
    input.cacheWriteTokens,
    input.costUsd
  );
  return id;
}

/**
 * Sum of cost_usd for a user in a given month (YYYY-MM).
 * Uses idx_usage_user_month covering index.
 */
export function getMonthlySpend(userId: string, yyyymm: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
         FROM usage_events
        WHERE user_id = ? AND substr(created_at, 1, 7) = ?`
    )
    .get(userId, yyyymm) as { total: number };
  return row.total;
}

export interface MonthlySummary {
  monthStart: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { costUsd: number; messages: number }>;
}

export function getMonthlySummary(userId: string, yyyymm: string): MonthlySummary {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0)        AS total_cost,
         COALESCE(SUM(input_tokens), 0)    AS total_in,
         COALESCE(SUM(output_tokens), 0)   AS total_out
       FROM usage_events
       WHERE user_id = ? AND substr(created_at, 1, 7) = ?`
    )
    .get(userId, yyyymm) as { total_cost: number; total_in: number; total_out: number };

  const byModelRows = db
    .prepare(
      `SELECT model,
              COALESCE(SUM(cost_usd), 0) AS cost,
              COUNT(*)                   AS count
       FROM usage_events
       WHERE user_id = ? AND substr(created_at, 1, 7) = ?
       GROUP BY model`
    )
    .all(userId, yyyymm) as Array<{ model: string; cost: number; count: number }>;

  const byModel: Record<string, { costUsd: number; messages: number }> = {};
  for (const r of byModelRows) {
    byModel[r.model] = { costUsd: r.cost, messages: r.count };
  }

  return {
    monthStart: `${yyyymm}-01T00:00:00Z`,
    totalCostUsd: totals.total_cost,
    totalInputTokens: totals.total_in,
    totalOutputTokens: totals.total_out,
    byModel,
  };
}
