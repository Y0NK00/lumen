# Lumen — Session Handoff

> Last updated: 2026-04-26 (Session 3)
> Use this file to orient any new session. Paste it at the top of the chat.
> **Also read `BUGS.md`** in the repo root — it has root causes and exact fixes for every bug encountered. Read it before touching UI, voice, or migration code.

---

## Repo & Deploy

| Thing | Value |
|---|---|
| GitHub repo | https://github.com/Y0NK00/lumen |
| Active branch | `v2` (master = old Electron version, ignore it) |
| Live URL | https://lumen.myspiritdomain.net |
| Deploy target | Unraid Tower → `/mnt/user/appdata/lumen/lumen-server` |
| Container name | `lumen-server` |
| Web terminal | https://tower.local/webterminal/ttyd/ |
| PC dev folder | `C:\Dev\tower-ai-app` (cloned from v2, keep pulled) |

**Deploy flow:** Edit on PC or Unraid → commit → push to v2 → rebuild on Unraid:
```bash
cd /mnt/user/appdata/lumen/lumen-server
docker compose up -d --build --force-recreate 2>&1 | tail -5
```

**Git identity on Unraid** (set once, persists):
```bash
git config --global user.email "dejavuyonko@gmail.com"
git config --global user.name "Will"
```

**GitHub push from Unraid** requires a PAT (GitHub killed password auth):
```bash
git remote set-url origin https://Y0NK00:TOKEN@github.com/Y0NK00/lumen.git
```

---

## Architecture

```
lumen-server/          Fastify + better-sqlite3 + SSE streaming
  src/
    db/
      migrations/      SQL files — must be explicitly COPY'd in Dockerfile
      db-migrate.ts    Migration runner — inserts into schema_version itself
  docker/
    Dockerfile         Multi-stage build; runtime image = lumen user, non-root
  docker-compose.yml   Defines container, volumes, healthcheck
  entrypoint.sh        Runs migrations then starts server

lumen-pwa/             React + Vite PWA, built to static files served by server

/data/lumen.db         SQLite DB — volume-mounted, PERSISTS across rebuilds
```

**Ports:** Server listens on `0.0.0.0:7747` (IPv4 only — see tripwires)

**Health endpoint:** `GET http://127.0.0.1:7747/api/health` → `{"ok":true,"version":"0.1.0","uptime":N}`

---

## Known Tripwires

| Tripwire | Detail |
|---|---|
| `.sql` files not compiled by tsc | Must add explicit `COPY` in Dockerfile for every new migrations folder |
| `db-migrate.ts` inserts into `schema_version` itself | Never put `INSERT INTO schema_version` inside a migration `.sql` file — double insert = UNIQUE constraint crash |
| Healthcheck `localhost` = IPv6 on this container | Use `127.0.0.1` explicitly, not `localhost` |
| ttyd freezes on heavy docker build output | Pipe build output: `2>&1 \| tail -5` |
| PWA service worker caches aggressively | Clear cache after every deploy on mobile |
| `/data` SQLite volume persists | DB state carries across rebuilds — old schema issues survive unless you drop tables or the volume |
| PC folder can go stale | Always `git pull origin v2` before editing on PC |
| `scrollIntoView({ behavior: 'smooth' })` | Black screen on iOS Safari — always use `behavior: 'auto'` (see BUG-001) |
| `SpeechRecognition.continuous = false` | Stops voice after first pause — always use `continuous: true` (see BUG-003) |

---

## Current State (as of 2026-04-26)

- Container: `Up (healthy)` ✅
- Migration runner: clean, `applied:0, currentVersion:2` ✅  
- Server: listening on `0.0.0.0:7747` ✅
- Latest commit: `65f1098` on `v2`

### Schema versions
| Version | Migration | Status |
|---|---|---|
| 1 | `001_initial.sql` | Applied |
| 2 | `002_memories.sql` | Applied |

---

## Session Log

### Session 1 (prior session — context from handoff)
**Problem:** App hung on every message ("Generating..." forever)  
**Root cause:** `Dockerfile` didn't `COPY src/db/migrations` into the runtime image → `002_memories.sql` never ran → `memories` table didn't exist → `listMemories()` crashed every request  
**Fix:** Added `COPY --from=server-builder --chown=lumen:lumen /app/src/db/migrations ./dist/src/db/migrations` to Dockerfile via `sed` on Unraid

**New problem surfaced:** `002_memories.sql` had its own `INSERT OR IGNORE INTO schema_version VALUES (2)` AND `db-migrate.ts` also inserts into `schema_version` → UNIQUE constraint violation → restart loop

---

### Session 2 (2026-04-26)
**Problems resolved:**

**1. UNIQUE constraint crash (restart loop)**
- `002_memories.sql` had a duplicate `INSERT OR IGNORE INTO schema_version (version) VALUES (2)` line
- `db-migrate.ts` already handles schema_version tracking — the SQL file should never touch it
- Fix: `sed -i '/INSERT OR IGNORE INTO schema_version/d' .../002_memories.sql`
- Result: migration runner completes cleanly, `applied:0, currentVersion:2`

**2. Healthcheck always failing (unhealthy)**
- Healthcheck used `http://localhost:7747/api/health`
- Inside this container, `localhost` resolves to `::1` (IPv6)
- Node server only binds `0.0.0.0` (IPv4) — so IPv6 connect = connection refused
- `http://127.0.0.1:7747/api/health` works perfectly
- Fix: `sed -i 's|localhost:7747|127.0.0.1:7747|' docker-compose.yml`
- Result: container reports `(healthy)`

**3. Pushed to GitHub**
- Commit `65f1098` on branch `v2`
- 3 files changed: `docker/Dockerfile`, `docker-compose.yml`, `src/db/migrations/002_memories.sql`

---

## Immediate Next Steps

1. **Commit & push** (from `C:\Dev\tower-ai-app`):
   ```bash
   git add -A
   git commit -m "fix: black screen scroll, voice continuous mode, resend button, add BUGS.md"
   git push origin v2
   ```
2. **Rebuild on Unraid:**
   ```bash
   cd /mnt/user/appdata/lumen/lumen-server
   git pull origin v2
   docker compose up -d --build --force-recreate 2>&1 | tail -5
   ```
3. **Test on phone:** Clear service worker cache. Test voice (should stay on through pauses). Test resend button (hover a message, arrow icon appears left of the bubble).

---

## Adding a New Migration (correct pattern)

```sql
-- src/db/migrations/003_your_feature.sql
-- Migration 003: describe what this does
ALTER TABLE ...;
CREATE INDEX ...;
-- NO INSERT INTO schema_version here
```

Then in `db-migrate.ts`, register version 3 in the migrations array. Rebuild.
