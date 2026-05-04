# Lumen — AI Session Handoff
> Paste this at the start of every Cursor / Windsurf / AI coding session.
> Last updated: 2026-05-03

**Latest session (desktop PWA shell):** See **`SESSION_HANDOFF.md`** — Claude-style main-column header (Chat/Cowork/Code + New chat): left alignment, removed floating card wrapper, sidebar duplicate New chat removed. **`UI_HANDOFF.md`** still lists older PWA polish items (hover JS → Tailwind, a11y, etc.).

---

## What This App Is

**Lumen** is a personal AI assistant app built and maintained by Will (non-developer, learning as he goes). It has these pieces:

1. `lumen-server/` — Node.js backend (Fastify + SQLite), runs on Will's Unraid home server in Docker
2. `lumen-pwa/` — React frontend (Vite PWA), served by the server, accessed from any browser/phone
3. `lumen-browser-extension/` — Chrome extension that connects to the server
4. `lumen-jarvis/` — Python desktop **Jarvis** client on Will's PC: push-to-talk voice → Groq Whisper → same Lumen SSE API as the PWA → Edge TTS, plus an optional browser HUD (see Phase 4 below). **One Python process** embeds the HUD as a Flask thread — not a separate deployed service.

The app is fully deployed and in active use. Will accesses it on his iPhone via PWA at `https://lumen.myspiritdomain.net`.

---

## Locations

| Thing | Value |
|---|---|
| GitHub repo | https://github.com/Y0NK00/lumen |
| Active branch | `v2` — this is the only branch that matters. `master` is an old archived Electron version, ignore it entirely. |
| Live URL | https://lumen.myspiritdomain.net |
| Server location | Unraid Tower at `/mnt/user/appdata/lumen/lumen-server` |
| PC dev folder | `C:\Dev\tower-ai-app` |
| Docker container | `lumen-server` |
| Unraid web terminal | https://tower.local/webterminal/ttyd/ |

---

## Architecture

```
lumen-server/
  src/
    routes/         HTTP endpoints (auth, conversations, messages, memory, settings, oauth, usage, admin)
    db/
      schema.sql    SQLite schema — users, conversations, messages, memories, usage_events, etc.
      migrations/   001_initial.sql, 002_memories.sql — run by db-migrate.ts on startup
      repos/        Data access layer (conversations.ts, messages.ts, memory.ts, users.ts, usage.ts, sessions.ts)
    services/
      providers/
        anthropic.ts  Streams responses from Claude API, handles token usage, auto-titling
    middleware/     auth.ts (JWT), budget.ts (monthly spend limits)
    lib/            logger, password (bcrypt), token (JWT)

lumen-pwa/
  src/
    components/     ChatPane, MessageList, InputBox, Sidebar, Layout, SettingsView, LoginPage, MarkdownRenderer
    stores/         appStore.ts (conversations + messages), authStore.ts, themeStore.ts
    hooks/          useStream.ts (SSE streaming), useTheme.ts, useVisualViewport.ts
    lib/
      api.ts        Typed fetch client — all API calls go through here, injects JWT automatically
      stream.ts     SSE stream handler

lumen-browser-extension/
  background.js     Service worker
  popup.html/js     Extension popup UI
  offscreen.html/js Offscreen document for audio

lumen-jarvis/
  lumen-jarvis.py   Entry: voice orchestration + JarvisController + starts HUD thread
  jarvis_voice.py   SHIPPED: hotkey, PyAudio, Groq STT, Lumen JWT + SSE (text_delta), Edge TTS + playsound
  hud_server.py     Flask app (daemon thread only) — serves HUD + GET /api/state
  hud/              Iron Man–style HUD (HTML/CSS/JS); polls state for phases
  requirements.txt  groq, edge-tts, pyaudio, keyboard, requests, flask, playsound, …
```

**Ports:** Server listens on `0.0.0.0:7747`

**Health check:** `GET http://127.0.0.1:7747/api/health` → `{"ok":true}`

**Auth:** JWT tokens. Stored in browser `localStorage` as `lumen_token`. All API calls send `Authorization: Bearer <token>`.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Fastify, better-sqlite3, TypeScript |
| Frontend | React 18, Vite, Zustand, TypeScript |
| Database | SQLite at `/data/lumen.db` (volume-mounted, persists across Docker rebuilds) |
| AI | Claude API (Anthropic) — models: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| Deployment | Docker on Unraid, docker-compose.yml |
| Styling | Plain CSS with CSS variables for theming |

---

## Key API Endpoints

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` | Returns JWT token |
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get conversation + messages |
| PATCH | `/api/conversations/:id` | Update title, model, system prompt |
| DELETE | `/api/conversations/:id` | Soft-delete conversation |
| POST | `/api/conversations/:id/messages` | Send message — returns SSE stream |
| POST | `/api/conversations/:id/abort` | Stop a streaming response |
| GET | `/api/memory` | List user memories |
| POST | `/api/memory` | Add a memory |
| DELETE | `/api/memory/:id` | Delete a memory |
| GET | `/api/settings` | Get user settings |
| PATCH | `/api/settings` | Update user settings |

**Send message SSE events (typical order):**
- `message_created` — user message saved
- `assistant_start` — assistant message placeholder created, gives you `messageId`
- `text_delta` — streaming text `{ "delta": "..." }` (matches `lumen-pwa` `stream.ts` — not legacy `delta` / `text`)
- `usage` — token counts + `costUsd`
- `title_updated` — only on first message when title was still default, auto-generated title
- `done` — stream complete
- `error` — e.g. budget / failure

---

## Database Schema (important tables)

- `users` — id, email, password_hash, display_name, role (admin|user), monthly_budget_usd, settings_json
- `conversations` — id, user_id, project_id, title, model, system_prompt, last_message_at
- `messages` — id, conversation_id, user_id, role, content_json (array of content blocks), finish_reason
- `memories` — id, user_id, content, source — injected into every conversation's system prompt
- `usage_events` — per-message token counts and cost in USD
- `projects` — id, user_id, name, description, system_prompt, pinned
- `extension_tokens` — long-lived tokens for browser extension auth
- `scheduled_tasks` — cron-based prompt scheduling
- `vault_chunks` — semantic search embeddings for Obsidian vault integration
- `schema_version` — migration tracking (current version: 2)

---

## Deploy Flow

**From PC (after making changes):**
```bash
cd C:\Dev\tower-ai-app
git add -A
git commit -m "your message"
git push origin v2
```

**On Unraid (rebuild):**
```bash
cd /mnt/user/appdata/lumen/lumen-server
git pull origin v2
docker compose up -d --build --force-recreate 2>&1 | tail -20
```

**After deploy on iPhone:** Clear site data in Safari settings for `lumen.myspiritdomain.net` — the PWA service worker caches aggressively.

---

## Known Bugs — All Fixed

These are FIXED. Listed here so you don't re-introduce them.

### BUG-001 — Black screen on iOS Safari during streaming
**File:** `lumen-pwa/src/components/Layout.tsx`
**Cause:** `backdropFilter: 'blur(20px)'` on the always-visible mobile top bar forced a GPU compositing layer. React re-rendering streaming content at ~30fps caused iOS to flash black.
**Fix:** Removed backdropFilter from the mobile top bar. Background is now solid `rgba(8,8,16,0.97)`.
**Rule: Never add backdrop-filter to any element that's visible during streaming.**

### BUG-002 — View doesn't follow streaming content (scroll doesn't auto-follow)
**Files:** `lumen-pwa/src/components/MessageList.tsx`, `ChatPane.tsx`
**Cause:** scroll useEffect watched `[messages]` (full array) — Zustand creates a new array on every delta, so it fired 30x/sec causing performance issues.
**Fix:** `useEffect([messages.length])` for new message added. Separate `useEffect([isStreaming])` runs a requestAnimationFrame loop during streaming, checks if user is within 150px of bottom, sets `scrollTop` directly.

### BUG-003 — Voice input stops after a few seconds
**File:** `lumen-pwa/src/components/InputBox.tsx`
**Cause:** `recognition.continuous = false` — browser stops after first pause in speech.
**Fix:** `recognition.continuous = true`. Added `preVoiceTextRef` to preserve existing textarea text before voice starts, then prepends it to the transcript.

### BUG-004 — No resend button on user messages (hover-only = invisible on mobile)
**Files:** `MessageList.tsx`, `ChatPane.tsx`
**Fix:** ResendButton component, always visible at 40% opacity (not hover-only). Left of each user bubble. Highlights on onMouseEnter / onTouchStart.
**Rule: Never use opacity-0 group-hover:opacity-100 for touch-primary UI.**

### BUG-005 — Migration crash (UNIQUE constraint on schema_version)
**File:** `lumen-server/src/db/migrations/002_memories.sql`
**Cause:** Migration file had its own `INSERT OR IGNORE INTO schema_version VALUES (2)`. The migration runner in `db-migrate.ts` ALSO inserts into schema_version after running the file — plain INSERT (no OR IGNORE) → UNIQUE crash → restart loop.
**Fix:** Removed the INSERT line from the migration file.
**Rule: NEVER put INSERT INTO schema_version inside .sql migration files. The runner handles it.**

### BUG-006 — Healthcheck always failing (localhost = IPv6)
**File:** `lumen-server/docker-compose.yml`
**Cause:** `localhost` inside this container resolves to `::1` (IPv6). Node server only binds `0.0.0.0` (IPv4).
**Fix:** Changed healthcheck to `http://127.0.0.1:7747/api/health`.
**Rule: Always use 127.0.0.1, never localhost, in healthchecks.**

### BUG-007 — .sql migration files missing from Docker image
**File:** `lumen-server/docker/Dockerfile`
**Cause:** `tsc` does not copy .sql files. The COPY for `src/db/migrations` was missing from the runtime stage.
**Fix:** Added `COPY --from=server-builder --chown=lumen:lumen /app/src/db/migrations ./dist/src/db/migrations` to Dockerfile.
**Rule: Any non-TypeScript file in src/ needs an explicit COPY line in the Dockerfile.**

### BUG-008 — Message list jumps to top when keyboard opens on iOS
**File:** `lumen-pwa/src/hooks/useVisualViewport.ts`
**Cause:** requestAnimationFrame fired during the keyboard animation before layout settled. scrollHeight measured incorrectly mid-animation.
**Fix:** Changed requestAnimationFrame to setTimeout(..., 150) to wait for keyboard animation to finish.

---

## Tripwires — Do Not Break These

| Tripwire | Rule |
|---|---|
| `.sql` files and tsc | tsc doesn't emit .sql files. Every new migrations folder needs an explicit COPY in the Dockerfile. |
| `db-migrate.ts` owns schema_version | Never put INSERT INTO schema_version inside a migration .sql file. The runner handles it. Duplicate insert = UNIQUE crash = restart loop. |
| Healthcheck uses 127.0.0.1 | Never use `localhost` — it resolves to IPv6 inside this container. |
| `/data` SQLite volume persists | The DB survives docker container recreates. Schema state from old deploys carries forward. Old migration conflicts survive unless you drop tables or the volume. |
| `backdrop-filter` during streaming | Never add backdrop-filter to always-visible elements — iOS Safari compositing layer trap = black screen. |
| Scroll useEffect dependencies | Never watch `[messages]` (full array) in scroll effects — Zustand creates new array on every delta → 30fps useEffect = performance trap. |
| PWA service worker | Clear Safari site data on iPhone after every deploy or changes won't appear. |
| `docker compose up --build` | Does NOT recreate the container if compose thinks nothing changed. Always use `--force-recreate`. |
| Two codebases in one repo | `master` = old archived Electron app. `v2` = current active app. Never work on master. |

---

## Pending Backlog (not yet built)

| Feature | Notes |
|---|---|
| Delete chat on mobile | Function exists at `Sidebar.tsx:115-118`, no UI trigger wired up for mobile |
| Conversation search | Sidebar search bar — UI exists but not wired |
| Hide unbuilt sidebar nav | Projects/Artifacts/Code/Dispatch placeholders in sidebar — greyed out, not built |
| Auto-deploy webhook | After each git push, auto-trigger Unraid rebuild |
| Export chat | Nice-to-have |
| Image attachments | Schema has `attachments` table with `kind: 'image'` support, UI not built |
| Scheduled tasks UI | DB table exists (`scheduled_tasks`), no frontend |
| Vault/Obsidian integration | DB has `vault_chunks` table for semantic search, not wired |

---

## Adding a New Migration (correct pattern)

```sql
-- src/db/migrations/003_your_feature.sql
-- Migration 003: describe what this does
ALTER TABLE ...;
CREATE INDEX ...;
-- NO INSERT INTO schema_version here
```

Then in `db-migrate.ts`, add version 3 to the migrations array.
Add a COPY line to the Dockerfile for the migrations folder.
Rebuild.

---

# PHASE 4: Jarvis Mode (Voice + Vision)

Voice-activated assistant on Will's PC (Iron Man–style HUD optional). **No lumen-server changes required** — same JWT + `/api/conversations/:id/messages` SSE contract as `lumen-pwa` (`stream.ts`: events include `text_delta` with `{ "delta": "..." }`).

## Current status (2026-05)

### Shipped

| Piece | Notes |
|-------|--------|
| **`jarvis_voice.py`** | Push-to-talk: global `keyboard` hotkey (hold to record WAV via PyAudio) → Groq Whisper → POST streaming message → SSE `text_delta` accumulation → Edge TTS (MP3) → `playsound` playback. Updates `JarvisController` so the HUD shows real phases: `listening` → `transcribing` → `thinking` (live assistant text) → `speaking` → `idle`. |
| **`lumen-jarvis.py`** | Starts Flask `hud_server` in a **background thread** (same OS process — not a third server). Registers voice when `LUMEN_EMAIL`, `LUMEN_PASSWORD`, `GROQ_API_KEY` are set. **`--demo`** = simulated HUD phases only; **`--no-voice`** = HUD dev without mic/API. |
| **`hud/` + `hud_server.py`** | Browser HUD; `GET /api/state` polls `JarvisController`. |
| **Conversation** | REST auto pick/create conversation titled **Jarvis**. |

### Runtime model (don't over-count processes)

- **Usually two OS processes:** `lumen-server` (Docker) **+** `python lumen-jarvis.py` on the PC. The HUD is **not** a separate deployable — Flask runs **inside** the Jarvis process.

### Next up (priority order)

1. **`pywebview` (or similar) desktop shell** — Dedicated window loading the same HUD URL; foundation for frameless / always-on-top and closer to desktop overlay UX than a bare browser tab. **Explicit next architectural step.**
2. **Screenshot + "look at my screen"** — Blocked until **real multimodal/image path** on lumen-server when ready.
3. **Wake word** (`openWakeWord` or equivalent).
4. **Tray icon (`pystray`), startup task, voice shortcuts** — polish.

Setup, `.env`, flags: **`lumen-jarvis/README.md`**.

## Legacy micro-steps (historical)

Original checklist (scaffold → hotkey → Groq → SSE → TTS → E2E) is **done** in `jarvis_voice.py` + `lumen-jarvis.py`. Further work maps to pywebview, vision, wake word above.

## Phase 4 future enhancements

- Full image/multimodal attachment path in lumen-server (needed for vision Jarvis)
- Wake word ("Hey Lumen"), `pystray`, Windows startup task
- Voice shortcuts: "new chat", "clear memory", etc.
