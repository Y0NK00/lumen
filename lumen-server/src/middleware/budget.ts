import type { FastifyReply, FastifyRequest } from 'fastify';
import { getUserById } from '../db/repos/users.js';
import { getMonthlySpend } from '../db/repos/usage.js';
import { logger } from '../lib/logger.js';

/**
 * Middleware: Blocks the request if the user is over their monthly budget.
 * Applied only to cost-incurring endpoints (POST /api/conversations/:id/messages).
 *
 * Also emits a budget.threshold audit event + email alert if user crosses
 * their alert threshold for the first time this month.
 */
export async function checkBudget(req: FastifyRequest, reply: FastifyReply) {
  if (!req.auth) {
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Budget check requires auth' } });
  }

  const user = getUserById(req.auth.userId);
  if (!user) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
  }

  const now = new Date();
  const month = now.toISOString().slice(0, 7); // 'YYYY-MM'
  const spend = getMonthlySpend(user.id, month);

  if (spend >= user.monthlyBudgetUsd) {
    logger.warn({ userId: user.id, spend, budget: user.monthlyBudgetUsd }, 'budget exceeded');
    return reply.code(402).send({
      error: {
        code: 'BUDGET_EXCEEDED',
        message: `Monthly budget of $${user.monthlyBudgetUsd.toFixed(2)} reached. Contact your admin or wait until next month.`,
        data: { spend, budget: user.monthlyBudgetUsd },
      },
    });
  }

  // TODO(phase-2): threshold alert + audit log + email via Resend
  // const utilization = spend / user.monthlyBudgetUsd;
  // if (utilization >= user.budgetAlertThreshold) { ... }
}
