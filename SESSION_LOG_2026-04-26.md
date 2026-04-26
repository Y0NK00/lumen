# Lumen Session Log: 2026-04-26 (Sunday)

## Repo & Deploy (READ FIRST — this is the context every session needs)

| Thing | Value |
|---|---|
| GitHub | https://github.com/Y0NK00/lumen |
| Active branch | **v2** (master is old Electron app, ignore it) |
| Live URL | https://lumen.myspiritdomain.net |
| Server location | Unraid Tower at `/mnt/user/appdata/lumen/lumen-server` |
| Local PC clone | `C:\Dev\tower-ai-app` (status unverified, may be stale) |
| Container name | `lumen-server` |
| Web terminal | https://tower.local/webterminal/ttyd/ |
| Push origin | TBD (suspect: from Unraid directly) |

---

## Current State (one-liner)

App is **down**. Container in restart loop. Fix is one sed away (see Step 1 in Next Session Roadmap).

---

## What Was Attempted

User reported on iPhone PWA:
1. "Generating..." stuck forever on every message
2. Sidebar nav buttons (Projects/Artifacts/Code/Dispatch) greyed out
3. No way to delete chats
4. Latest message positioned high in viewport with empty space below

### Investigation walkthrough

1. Read `Sidebar.tsx` and confirmed nav buttons (Projects/Artifacts/Code/Dispatch) are scaffolded placeholders, only `chats` wired up. Not a bug, just unbuilt features.
2. Confirmed delete handler exists at `Sidebar.tsx:115-118` but no UI button on mobile triggers it. Known unbuilt feature.
3. Ran `docker logs --tail 200 lumen-server` on Unraid via web terminal.
4. Found smoking gun: `"no migrations directory, nothing to do"` followed by repeated `SqliteError: no such table: memories` from `listMemories()` in `messages.ts:75`.
5. Container status was `Up 2 hours (unhealthy)`. Healthcheck failing because every API request crashed on missing memories table.

---

## What Was Fixed (in this session)

### Fix 1: Dockerfile missing COPY for migrations folder

The Dockerfile copies `schema.sql` explicitly because TypeScript doesn't emit `.sql` files, but it never copied the `migrations/` folder. Result: `db-migrate.ts` looked at `/app/dist/src/db/migrations`, didn't find it, exited clean, and `002_memories.sql` never ran.

Fix applied via sed on Unraid:
```bash
sed -i '49a\COPY --from=server-builder --chown=lumen:lumen /app/src/db/migrations ./dist/src/db/migrations' /mnt/user/appdata/lumen/lumen-server/docker/Dockerfile
```

After fix, line 50 of the Unraid Dockerfile reads:
```dockerfile
COPY --from=server-builder --chown=lumen:lumen /app/src/db/migrations ./dist/src/db/migrations
```

Rebuild succeeded:
- Build time: 71.1s (real rebuild, not cache)
- New container ID: `7b0bdae0cc74`
- Migrations folder now present in `/app/dist/src/db/migrations/` inside the container

---

## What's Still Broken (CRITICAL — start next session here)

### Container crash loop: duplicate schema_version insert

After Fix 1, the container boots, finds the migrations folder, runs `002_memories.sql`. But the migration file itself contains:
```sql
INSERT OR IGNORE INTO schema_version (version) VALUES (2);
```

Then `db-migrate.ts` ALSO does:
```ts
db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
```

Runner's plain INSERT (no OR IGNORE) hits the version 2 row the migration just wrote. UNIQUE constraint violation. Whole transaction rolls back. Container crashes. Tini restarts. Loop forever.

**Status as of session end:** Container `7b0bdae0cc74` is `Restarting (1)`. App still down.

### Side issue: bottom of MessageList

`MessageList.tsx` uses `flex-1 overflow-y-auto` so messages stack from the top, leaving a giant void below a single short message. Cosmetic but bad UX. Easy fix later.

---

## Next Session: Immediate Roadmap

### Step 1: Fix the migration file
```bash
sed -i '/INSERT OR IGNORE INTO schema_version/d' /mnt/user/appdata/lumen/lumen-server/src/db/migrations/002_memories.sql

cat /mnt/user/appdata/lumen/lumen-server/src/db/migrations/002_memories.sql
```

Should show ~8 lines: comment, CREATE TABLE, CREATE INDEX. NO insert line.

### Step 2: Rebuild and recreate
```bash
cd /mnt/user/appdata/lumen/lumen-server && docker compose up -d --build --force-recreate
sleep 15
docker ps --filter name=lumen-server
docker logs --tail 30 lumen-server | grep -E "migration|memories|listening|Error"
```

Want to see:
- `STATUS: Up X seconds (healthy)` (or `(starting)` first 15s)
- Log: `"msg":"migration applied"` with version 2
- Log: `"msg":"Server listening at http://0.0.0.0:7747"`

### Step 3: Verify on phone
1. iPhone Safari → Settings → Safari → Advanced → Website Data → search `lumen.myspiritdomain.net` → delete
2. Reopen the PWA from home screen
3. Send a test message
4. Confirm streaming response works
5. Verify the 5 unverified features from the previous handoff:
   - Auto-title generation after first message
   - Memory CRUD in Settings → Memory
   - System prompt per chat (lock icon in input)
   - Connectors page status calls
   - New chat button uses pencil icon

### Step 4: Sync the fixes back to git
On Unraid:
```bash
cd /mnt/user/appdata/lumen/lumen-server
git status
git branch    # confirm we're on v2
git add docker/Dockerfile src/db/migrations/002_memories.sql
git commit -m "fix(deploy): copy migrations folder in Dockerfile; remove duplicate schema_version insert"
git push origin v2
```

If `git status` shows we're not in a git repo, that's a finding worth investigating before committing anywhere.

### Step 5: Verify PC repo state
On PC PowerShell:
```powershell
cd C:\Dev\tower-ai-app
git remote -v
git branch
git status
git log --oneline -5
```

Decision tree based on output:
- Repo on `v2`, clean → `git pull origin v2` to sync
- On `master` → `git checkout v2 && git pull`
- Not a git repo → back up the folder, then `git clone -b v2 https://github.com/Y0NK00/lumen.git tower-ai-app`

### Step 6: Document the deploy flow
Create `DEPLOY.md` in the repo root covering:
- Edit on PC → commit → push to v2
- SSH/terminal into Unraid → `git pull origin v2` → `docker compose up -d --build --force-recreate`
- Webhook auto-deploy plan (future, post-MVP)

---

## Backlog (carried + new)

| Feature | Status | Notes |
|---|---|---|
| Auto-title | Built, NEEDS deploy verification | Sidebar updates after first message |
| Memory system | Built, NEEDS deploy verification | CRUD in Settings |
| System prompt per chat | Built, NEEDS deploy verification | Lock icon in InputBox |
| OAuth connectors UI | Built, NEEDS deploy verification | Google connect/disconnect |
| Delete chat (mobile UI) | Not started | Function exists in `Sidebar.tsx:115-118`, no UI trigger |
| Conversation search | Not started | Sidebar search bar |
| Export chat | Not started | Nice-to-have |
| Bottom-anchor message list | Not started | Cosmetic, void below short messages |
| Hide unbuilt nav placeholders | Not started | Projects/Artifacts/Code/Dispatch in sidebar |
| Auto-deploy webhook | Not started | After Step 6 (DEPLOY.md) |

---

## Lessons (process improvements)

### For Claude (next session, READ THIS)
1. **First question on infra tasks must be: "What's the deploy flow + remote setup?"** Don't assume.
2. **Check ALL branches when given a repo URL.** `git branch -a` locally or `/branches` API endpoint. Default branch is not always the active one.
3. **Confirm the canonical source BEFORE editing any file.** Edited the wrong Dockerfile this session because dev (PC) and prod (Unraid) had diverged.
4. **Web terminals freeze under heavy docker build output.** Don't try to drive ttyd through Claude in Chrome during builds. Hand commands to the user instead.
5. **Verify sed matches actually fired.** Sed silently does nothing on no-match. Always grep after.
6. **`docker compose up --build` does NOT recreate the container** if compose thinks nothing changed. Use `--force-recreate`.

### For Will
The handoff template needs updating. The existing `SESSION_HANDOFF.md` is solid on features but missed critical meta-context (no mention of GitHub or branch). Use the template at the top of this doc going forward. Put **Repo & Deploy** as the first section, every time.

---

## Known Tripwires (carried + new from this session)

- **TypeScript skips .sql files.** Anything non-TS in `src/` needs explicit COPY in Dockerfile. Same for any other non-TS asset.
- **`/data` SQLite volume persists across container recreates.** Schema state from old broken deploys carries forward and can cause weird migration conflicts (this session's whole second wave of bugs).
- **Migration files should NOT insert into schema_version themselves.** The runner handles that. Putting `INSERT OR IGNORE INTO schema_version VALUES (X)` in a migration file conflicts with the runner's own plain INSERT and crashes the container.
- **Em dashes in JSX comments cause TSX parse errors.** Avoid.
- **Write tool truncates at ~281 lines silently.** Use bash heredoc for large files.
- **PWA service worker caches aggressively.** Clear site data on mobile after every deploy.
- **Web terminal (ttyd) renderer freezes during heavy docker build output.** Wait it out, or refresh the tab.
- **`docker compose up --build` does NOT recreate the container** if compose thinks nothing changed. Use `--force-recreate` to be sure.
- **Pruning before rebuild** is critical on tight Unraid disk. Weekly cron exists, but manual prune + rebuild can be needed.
- **GitHub repo `Y0NK00/lumen` has TWO codebases.** `master` = old Electron app (archived), `v2` = current PWA + Fastify (active). Don't get confused. Ignore master entirely unless explicitly working on the Electron version.

---

## Session Stats

- Duration: ~3 hours
- Token spend: heavy (Opus, lots of debugging back-and-forth)
- Wrong turns: 2 (edited wrong Dockerfile in dev repo, missed `v2` branch when reviewing GitHub)
- Real fixes shipped: 1 (Dockerfile migrations COPY)
- Pending fixes: 1 (remove duplicate schema_version insert)
- Files touched in repo:
  - `lumen-server/docker/Dockerfile` (PC copy edited but irrelevant; Unraid copy is the real one)
  - `lumen-server/src/db/migrations/002_memories.sql` (next session)

---

## How to brief next session

Open new chat with Sonnet, paste this as first message:

```
I'm continuing work on Lumen. Read C:\Dev\tower-ai-app\SESSION_LOG_2026-04-26.md
first — it has the full context, current state, and immediate work needed.
Start with Step 1 of the Next Session Roadmap.
```

That's it. The log has everything needed.
