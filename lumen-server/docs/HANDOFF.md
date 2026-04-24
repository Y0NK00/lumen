# Lumen Server — Handoff Brief

Pickup doc for the next chat. Read this first, then `SESSION_LOG_2026-04-23.md` if you need the why behind decisions.

## TL;DR

All external infrastructure for Lumen is live. Server-side code is the only thing left before v1 can boot publicly.

- Domain, email, tunnel, Access policy, Google OAuth: **done**
- Server code routes beyond health/auth: **not written yet**
- Deployment files still assume a second cloudflared container: **needs rewrite**

## Infrastructure state (all live)

| Layer | Status | Identifier |
|---|---|---|
| Domain | live on Cloudflare | `myspiritdomain.net` |
| Email sending | Resend verified | region us-east-1 |
| Public hostname | routed via homelab tunnel | `lumen.myspiritdomain.net` → `10.0.0.22:7747` |
| Tunnel | reused existing | `dc9095a3-b670-4240-9f3e-62641fcef6a6` |
| Access policy | active, 1 allowlist (Will) | `d50215e1-2262-4b11-9b50-4fb566a4c609` |
| OAuth project | Google Cloud | `lumen-oauth-494205` |
| OAuth client | Web application | `909496381915-lgatm6buqpdrka060kpuuol9nps5hl3d.apps.googleusercontent.com` |

## Code state

### What exists (`lumen-server/src`)

- `index.ts` — Fastify bootstrap on port 7747, trust proxy for Cloudflare, 25MB body limit
- `routes/health.ts` — health check
- `routes/auth.ts` — `/api/auth/login`, `/me`, `/logout`
- `middleware/auth.ts` — `requireAuth`, `requireAdmin` preHandlers
- `lib/token.ts` — JWT sign/verify
- `db/schema.sql` — 13 tables, WAL mode, nanoid prefixes, soft-delete via `deleted_at`
- `db/repos/sessions.ts` — JWT session tracking with revocation
- `types/index.ts` — shared TypeScript types
- `scripts/db-init.ts` + `db-migrate.ts` — idempotent schema + versioned migrations
- `bootstrap.ts` — admin bootstrap from env

### What's missing (ordered pickup list)

1. **Conversation + message routes with SSE streaming** — `routes/conversations.ts`, `routes/messages.ts`. Content blocks stored in `messages.content_json`. SSE response for streaming Claude output.
2. **Provider abstractions** — `services/providers/anthropic.ts`, `services/providers/openai.ts`. Uniform streaming interface, image attachment support, per-call cost estimation using the `PRICE_*` env vars.
3. **Settings, usage, vault, admin routes** — `/api/settings` GET/PATCH, `/api/usage` monthly token counts, `/api/vault` encrypted secrets (uses `ENCRYPTION_KEY`), `/api/admin` user management.
4. **Google OAuth callback route** — `/api/oauth/google/start` + `/api/oauth/google/callback`. Store encrypted refresh token in `oauth_tokens` table. Redirect URI already registered: `https://lumen.myspiritdomain.net/api/oauth/google/callback`.
5. **One-time migration** — `scripts/migrate-legacy-data.ts` to ingest `conversations.json` + `mobile-conversations.json` into the new SQLite schema.
6. **Deployment files** — Rewrite `docker-compose.yml` to remove the cloudflared service. Update `docs/UNRAID_DEPLOY.md` to document tunnel reuse (no `TUNNEL_TOKEN`, only the `lumen-server` container).
7. **Local boot test** — `npm install`, `npm run db:init`, `npm run dev`, curl `/api/health`, login with admin bootstrap, test one SSE stream.

## Credentials location

Live `.env` is at `lumen-server/.env` (gitignored).

Three values still need to be filled before first boot:

- `ANTHROPIC_API_KEY` — from console.anthropic.com → API Keys
- `ADMIN_BOOTSTRAP_PASSWORD` — pick something strong
- `RESEND_API_KEY` — from resend.com → API Keys

Already populated: all secrets, Google OAuth client, Ollama base URL, CORS, JWT config, Claude pricing.

## Architectural decisions (locked, do not relitigate)

- **Tunnel reuse over second cloudflared.** lumen-server runs bare in its container. No `TUNNEL_TOKEN` env. If the homelab tunnel dies, lumen dies with it, same blast radius as other 10.0.0.22 services.
- **Cloudflare Access with Email OTP, not passwords at the edge.** Family gets a one-time code to their allowlisted email, Access issues a 24h session, then Lumen's own JWT auth runs underneath. Two auth hops by design.
- **Will-only allowlist for v1.** Daughter, cousin, brother get added after real-usage shakedown. One-click edit in the Access dashboard.
- **Shared Google OAuth client across all users.** Each family member links their own Google account via the Lumen UI, their refresh token is stored per-user in `oauth_tokens`.

## Known gotchas

- **Cloudflare dashboard breaks browser automation.** After any `form_input`, the tab goes into a `Cannot access a chrome-extension:// URL` error state. Re-navigating clears it but loses form data. If you need to touch CF config again, either use their API or just do it manually. Not worth the fight.
- **React form inputs need native prototype value setter workaround.** `form_input` sets DOM value but not React state. Use `HTMLInputElement.prototype.value` descriptor + dispatch `input`/`change` events with `bubbles: true`.
- **Google Cloud Console can freeze renderer.** Had a `Page.captureScreenshot` CDP timeout that didn't recover. If automation locks up there, hand off to the user manually.

## Copy-paste bootstrap prompt for new chat

```
Continuing Lumen server work. Read these first, in order:

1. lumen-server/docs/HANDOFF.md
2. lumen-server/docs/SESSION_LOG_2026-04-23.md
3. lumen-server/docs/SCHEMA.md
4. lumen-server/docs/API.md

All external infrastructure is live. Next up: conversation + message
routes with SSE streaming (pickup item #1 in HANDOFF.md).

My coding prefs: TypeScript strict mode, Zod for input validation,
better-sqlite3 for DB, nanoid for IDs, pino for logs. Keep routes
thin — business logic in services/, DB access in db/repos/.

Start by reading the existing code to match patterns, then propose
the route file structure before writing.
```
