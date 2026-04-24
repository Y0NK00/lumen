# Schema Notes

Detailed reasoning behind the SQLite schema (`src/db/schema.sql`).

## Why SQLite?

- Single file, trivial backup (`cp lumen.db lumen.db.bak`)
- Zero config, zero ops
- `better-sqlite3` is synchronous which is actually ideal for Node (no callback churn, no connection pool)
- WAL mode gives concurrent reads during writes (fine for 4 users)
- If we outgrow it (>100 req/s sustained or >100GB), migrate to Postgres. Not worrying about that now.

## Multi-Tenancy Strategy

**Shared database, `user_id` scoping at the app layer.** Every user-owned table has a `user_id` FK. Every repo query filters by `user_id` from the request context. No row-level security (SQLite doesn't have it natively), but middleware enforces the scope.

**Why not a DB per user?** Complicates migrations, backups, and admin queries. Shared DB with strict scoping is the standard pattern and works fine at this scale.

## Cost Tracking Model

The `usage_events` table is append-only. Every Claude API call writes one row. The `cost_usd` is computed **at write time** using the model's pricing so historical cost is preserved even if prices change.

**Monthly spend query (hot path):**
```sql
SELECT SUM(cost_usd)
FROM usage_events
WHERE user_id = ? AND substr(created_at, 1, 7) = ?
-- ? = 'u_abc', '2026-04'
```

Index `idx_usage_user_month` covers this. Under 10k events/month this is instant.

## Soft Delete Policy

Anything the user might want to recover uses `deleted_at` instead of `DELETE`. Conversations and projects follow this. Messages do not (cascade with conversation). Sessions and usage events do not (audit trail is append-only).

## Encryption at Rest

The SQLite file itself is not encrypted. Unraid array encryption handles disk-level. For sensitive fields:
- `password_hash`: bcrypt is already a one-way hash
- `oauth_tokens.access_token` and `refresh_token`: **TODO** encrypt with app-level key from env (`ENCRYPTION_KEY`). See `src/lib/crypto.ts`.
- Extension tokens: stored as hash only (never raw), user only sees raw once at generation time.

## Budget Enforcement

Middleware `budget.ts` runs before `POST /api/conversations/:id/messages`:

1. Compute `currentMonthSpend` via query above
2. If `currentMonthSpend >= user.monthly_budget_usd` → return 402
3. If `currentMonthSpend / budget >= user.budget_alert_threshold` AND no alert sent this month → enqueue alert email, mark in audit_log
4. Pass through

**Race condition note:** two simultaneous requests could both pass the check and together exceed the budget. Acceptable loss for now; post-call we can refund/block from there if it becomes a problem. Can add a transaction-level lock if needed.

## Audit Log

Everything security-relevant writes to `audit_log`:
- `auth.login`, `auth.login_failed`, `auth.logout`, `auth.token_refreshed`
- `user.created`, `user.updated`, `user.disabled`, `user.password_changed`
- `budget.threshold_reached`, `budget.exceeded`
- `admin.*` — every admin endpoint call
- `oauth.connected`, `oauth.revoked`
- `extension_token.created`, `extension_token.revoked`

Log retention: keep 90 days, then prune. Add cron job later.

## Future Migration to Postgres

If this ever needs to scale:
1. `better-sqlite3` → `pg` with a compatible query abstraction
2. `TEXT` ISO timestamps → `TIMESTAMPTZ` (date functions change)
3. `substr(created_at, 1, 7)` → `to_char(created_at, 'YYYY-MM')`
4. JSON columns → `JSONB`
5. Add row-level security policies (optional)

Would take a weekend. Not needed unless the household becomes a 50-user platform.
