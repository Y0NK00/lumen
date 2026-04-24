# Lumen Server

Headless backend for Lumen. Single source of truth for users, conversations, and settings. Runs as a Docker container on Unraid, serves all clients (Electron desktop, mobile PWA, browser extension) via REST + SSE + WebSocket.

## Architecture

```
  Internet → Cloudflare Tunnel → Cloudflare Access (email OTP)
                                         ↓
                              lumen-server (Node, Docker)
                                         ↓
                      SQLite (conversations, users, usage)
                                         ↓
                       Anthropic API (shared key, per-user tracking)
                                         ↓
                              Ollama on Unraid (embeddings)
```

Clients:
- **Electron desktop app** (PC, Mac) — thin client
- **Mobile PWA** (iOS, Android) — installed to home screen
- **Browser extension** — per-user WebSocket connection, tagged with user_id

## Quick Start (Local Dev)

```bash
cd lumen-server
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, JWT_SECRET at minimum
npm install
npm run db:init       # Creates SQLite DB + applies schema
npm run dev           # Starts server on :7747 with hot reload
```

Admin bootstrap: on first startup the server creates an admin user using `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` from env. Change the password after first login.

## Production Deploy (Unraid)

See `docs/UNRAID_DEPLOY.md`. Short version:

1. SSH to Unraid
2. `git clone` this repo into `/mnt/user/appdata/lumen/`
3. `cp .env.example .env && vim .env` — fill in all required vars
4. `docker compose up -d`
5. Set up Cloudflare Tunnel pointing at `http://unraid-ip:7747`
6. Set up Cloudflare Access email OTP policy in front of the tunnel

## Key Docs

- `docs/MIGRATION_AUDIT.md` — what's being extracted from `main.js` and how
- `docs/API.md` — full REST + SSE + WS contract for all clients
- `docs/SCHEMA.md` — database schema with reasoning
- `docs/UNRAID_DEPLOY.md` — step-by-step production deploy
- `docs/SECURITY.md` — auth, secrets, threat model

## Project Layout

```
lumen-server/
├── src/
│   ├── index.ts              # Entrypoint, Fastify server bootstrap
│   ├── routes/               # HTTP route handlers
│   │   ├── auth.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts       # SSE streaming endpoint
│   │   ├── settings.ts
│   │   ├── usage.ts          # User's token/cost usage
│   │   └── admin.ts          # User management (admin only)
│   ├── middleware/
│   │   ├── auth.ts           # JWT validation, user context
│   │   ├── budget.ts         # Per-user budget enforcement
│   │   └── errors.ts
│   ├── services/
│   │   ├── claude.ts         # Anthropic SDK wrapper + token counting
│   │   ├── ollama.ts         # Embeddings client
│   │   ├── vault.ts          # Per-user vault file ops
│   │   └── usage.ts          # Usage event writing + budget calc
│   ├── db/
│   │   ├── connection.ts     # better-sqlite3 singleton
│   │   ├── schema.sql        # Table definitions
│   │   ├── migrations/       # Versioned schema changes
│   │   └── repos/            # Typed data access per table
│   ├── lib/
│   │   ├── password.ts
│   │   ├── token.ts          # JWT sign/verify
│   │   └── logger.ts
│   └── types/
├── scripts/
│   ├── db-init.ts            # Apply schema.sql to fresh DB
│   ├── db-migrate.ts         # Run pending migrations
│   └── migrate-from-electron.ts  # One-time import from PC
├── docs/
├── docker/
│   ├── Dockerfile
│   └── entrypoint.sh
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```
