import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getUserById, createUser } from '../db/repos/users.js';
import { db } from '../db/connection.js';
import { logger } from '../lib/logger.js';

const adminPreHandler = [requireAuth, requireAdmin];

// ── Shared row types ──────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  monthly_budget_usd: number;
  budget_alert_threshold: number;
  disabled: number;
  settings_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function safeUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    monthlyBudgetUsd: row.monthly_budget_usd,
    budgetAlertThreshold: row.budget_alert_threshold,
    disabled: row.disabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Validators ────────────────────────────────────────────────────────────────

const createUserBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']).optional(),
  monthlyBudgetUsd: z.number().positive().optional(),
});

const updateUserBody = z.object({
  displayName: z.string().min(1).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
  monthlyBudgetUsd: z.number().positive().optional(),
  budgetAlertThreshold: z.number().min(0).max(1).optional(),
  disabled: z.boolean().optional(),
});

const listUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

const adminUsageQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
});

const auditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.coerce.number().int().optional(), // autoincrement id cursor
  userId: z.string().optional(),
  eventType: z.string().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {
  // GET /api/admin/users
  app.get('/api/admin/users', { preHandler: adminPreHandler }, async (req, reply) => {
    const q = listUsersQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid query params' } });
    }

    const limit = Math.min(q.data.limit ?? 50, 200);
    const params: unknown[] = [];
    let sql = `SELECT * FROM users WHERE deleted_at IS NULL`;

    if (q.data.cursor) {
      sql += ` AND created_at < (SELECT created_at FROM users WHERE id = ?)`;
      params.push(q.data.cursor);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as UserRow[];
    const items = rows.map(safeUser);
    const nextCursor = items.length === limit ? items[items.length - 1]?.id : null;

    return reply.send({ items, nextCursor });
  });

  // POST /api/admin/users  — admin creates a new user account
  app.post('/api/admin/users', { preHandler: adminPreHandler }, async (req, reply) => {
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }

    // Check for duplicate email
    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`)
      .get(parsed.data.email.toLowerCase());
    if (existing) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Email already in use' } });
    }

    const user = await createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      monthlyBudgetUsd: parsed.data.monthlyBudgetUsd,
    });

    logger.info({ actorId: req.auth!.userId, newUserId: user.id }, 'admin.user.created');
    return reply.code(201).send({ user });
  });

  // GET /api/admin/users/:id
  app.get('/api/admin/users/:id', { preHandler: adminPreHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = getUserById(id);
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return reply.send({ user });
  });

  // PATCH /api/admin/users/:id
  app.patch('/api/admin/users/:id', { preHandler: adminPreHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }

    const target = getUserById(id);
    if (!target) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const fields: string[] = [`updated_at = datetime('now')`];
    const params: unknown[] = [];

    const d = parsed.data;
    if (d.displayName !== undefined) { fields.push('display_name = ?'); params.push(d.displayName); }
    if (d.role !== undefined) { fields.push('role = ?'); params.push(d.role); }
    if (d.monthlyBudgetUsd !== undefined) { fields.push('monthly_budget_usd = ?'); params.push(d.monthlyBudgetUsd); }
    if (d.budgetAlertThreshold !== undefined) { fields.push('budget_alert_threshold = ?'); params.push(d.budgetAlertThreshold); }
    if (d.disabled !== undefined) { fields.push('disabled = ?'); params.push(d.disabled ? 1 : 0); }

    params.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params);

    const updated = getUserById(id);
    logger.info({ actorId: req.auth!.userId, targetId: id }, 'admin.user.updated');
    return reply.send({ user: updated });
  });

  // DELETE /api/admin/users/:id  — soft delete
  app.delete('/api/admin/users/:id', { preHandler: adminPreHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Prevent self-deletion
    if (id === req.auth!.userId) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
    }

    const result = db
      .prepare(`UPDATE users SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
      .run(id);

    if (result.changes === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    logger.info({ actorId: req.auth!.userId, targetId: id }, 'admin.user.deleted');
    return reply.send({ ok: true });
  });

  // GET /api/admin/usage?month=YYYY-MM  — cross-user spend summary for the month
  app.get('/api/admin/usage', { preHandler: adminPreHandler }, async (req, reply) => {
    const q = adminUsageQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: q.error.message } });
    }

    const yyyymm = q.data.month ?? new Date().toISOString().slice(0, 7);

    // Total across all users
    const totals = db
      .prepare(
        `SELECT
           COALESCE(SUM(cost_usd), 0)     AS total_cost,
           COALESCE(SUM(input_tokens), 0) AS total_in,
           COALESCE(SUM(output_tokens), 0) AS total_out,
           COUNT(*)                        AS events
         FROM usage_events
         WHERE substr(created_at, 1, 7) = ?`
      )
      .get(yyyymm) as { total_cost: number; total_in: number; total_out: number; events: number };

    // Per-user breakdown
    type UserSpend = { user_id: string; email: string; display_name: string; cost: number; events: number };
    const byUser = db
      .prepare(
        `SELECT u.user_id, users.email, users.display_name,
                COALESCE(SUM(u.cost_usd), 0) AS cost,
                COUNT(*) AS events
           FROM usage_events u
           JOIN users ON users.id = u.user_id
          WHERE substr(u.created_at, 1, 7) = ?
          GROUP BY u.user_id
          ORDER BY cost DESC`
      )
      .all(yyyymm) as UserSpend[];

    return reply.send({
      month: yyyymm,
      totalCostUsd: totals.total_cost,
      totalInputTokens: totals.total_in,
      totalOutputTokens: totals.total_out,
      totalEvents: totals.events,
      byUser: byUser.map((r) => ({
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name,
        costUsd: r.cost,
        events: r.events,
      })),
    });
  });

  // GET /api/admin/audit-log?limit=50&cursor=<id>&userId=&eventType=
  app.get('/api/admin/audit-log', { preHandler: adminPreHandler }, async (req, reply) => {
    const q = auditLogQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: q.error.message } });
    }

    const limit = Math.min(q.data.limit ?? 50, 200);
    const params: unknown[] = [];
    let sql = `SELECT al.*, u.email as actor_email
               FROM audit_log al
               LEFT JOIN users u ON u.id = al.actor_id
               WHERE 1=1`;

    if (q.data.userId) { sql += ` AND al.user_id = ?`; params.push(q.data.userId); }
    if (q.data.eventType) { sql += ` AND al.event_type = ?`; params.push(q.data.eventType); }
    if (q.data.cursor) { sql += ` AND al.id < ?`; params.push(q.data.cursor); }

    sql += ` ORDER BY al.id DESC LIMIT ?`;
    params.push(limit);

    type AuditRow = {
      id: number;
      user_id: string | null;
      actor_id: string | null;
      actor_email: string | null;
      event_type: string;
      details_json: string | null;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    };

    const rows = db.prepare(sql).all(...params) as AuditRow[];
    const items = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      eventType: r.event_type,
      details: r.details_json ? JSON.parse(r.details_json) : null,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));

    const nextCursor = items.length === limit ? items[items.length - 1]?.id : null;
    return reply.send({ items, nextCursor });
  });
}
