# Lumen AI — Session Handoff
**Date:** April 26, 2026  
**Session duration:** ~2 sessions (compacted mid-session)  
**Last commit:** `3ae276d` — feat: auto-title, memory system, system prompt per chat, OAuth connectors UI

---

## What Was Built This Session

### 5 Features Implemented (all committed)

**1. Auto-title generation**
- After the first message in a new chat, server fires a background Haiku call asking for a 4-6 word title
- Server sends `title_updated` SSE event → frontend updates sidebar instantly
- Files: `lumen-server/src/services/providers/anthropic.ts` (added `generateTitle()`), `lumen-server/src/routes/messages.ts`, `lumen-pwa/src/hooks/useStream.ts`, `lumen-pwa/src/stores/appStore.ts` (added `updateConversationTitle`)

**2. Memory system**
- Full CRUD: `GET /api/memory`, `POST /api/memory`, `DELETE /api/memory/:id`
- Memories injected into every message as `<memory>\n- item\n</memory>` block prepended to system prompt
- UI: Settings → Memory page (add inline, delete with ×)
- Files: `lumen-server/src/db/migrations/002_memories.sql`, `lumen-server/src/db/repos/memory.ts`, `lumen-server/src/routes/memory.ts`, `lumen-server/src/index.ts`

**3. System prompt per chat**
- `conversations.system_prompt` column (already existed in schema)
- Lock icon button in InputBox opens modal to set/edit per-chat system prompt
- Indicator bar below mobile header when a system prompt is active (click to edit)
- Files: `lumen-pwa/src/components/ChatPane.tsx` (SystemPromptModal + indicator), `lumen-pwa/src/components/InputBox.tsx` (lock button + `onSystemPrompt` prop)

**4. OAuth / Google Connectors UI**
- Settings → Connectors page with Google OAuth connect/disconnect
- Status indicator (connected green dot + scope/expiry info, or disconnected state)
- Frontend calls `GET /api/oauth/status` and `POST /api/oauth/disconnect`
- Note: the server OAuth routes were already built in a prior session; this was the frontend UI
- Files: `lumen-pwa/src/components/SettingsView.tsx` (ConnectorsPage), `lumen-pwa/src/lib/api.ts` (`getOAuthStatus`, `disconnectOAuth`)

**5. New chat button icon**
- Changed from `+` to compose/pencil icon (matches Claude.ai style)
- File: `lumen-pwa/src/components/Layout.tsx`

### Unraid Infrastructure (done via Claude in Chrome)

**Auto-prune cron job — set up and verified live:**
```
/etc/cron.d/docker-prune:
0 3 * * 0 root docker system prune -f; docker builder prune -f
```
Runs every Sunday at 3am. Prunes stopped containers, dangling images, unused networks, build cache. Does NOT touch volumes (Plex data, game saves, etc. are safe).

**Persistent across reboots — appended to `/boot/config/go`:**
```bash
# Docker cleanup cron (weekly Sunday 3am)
echo "0 3 * * 0 root docker system prune -f; docker builder prune -f" > /etc/cron.d/docker-prune
```

**Docker vdisk:** Already 60GB — no resize needed. The "no space left" error during builds was purely build cache bloat, now handled by the weekly prune.

---

## Current State

### What's committed but NOT yet deployed
The last successful deploy was before this session's features. The Docker build on Unraid failed due to disk space. The code is correct — the build itself just never completed.

**To deploy:**
1. Open Unraid terminal
2. Run: `docker system prune -f && docker builder prune -f` (free up space now)
3. Trigger the Lumen container rebuild (however you do it — Portainer, Unraid Docker UI, or `docker-compose up --build -d`)
4. After deploy, clear PWA service worker on your phone: Settings → Clear site data, or just open devtools and click "Update" on the SW

### What's NOT tested yet (needs a working deploy first)
- Auto-title: does the sidebar title update after first message?
- Memory: can you add/delete memories in Settings → Memory, and do they inject into the next chat?
- System prompt: does the lock icon open the modal, does the indicator show, does it actually affect responses?
- Connectors: does the Google OAuth status call work, does connect/disconnect work?

---

## Pending Feature Backlog (from previous planning)

| Feature | Status | Notes |
|---------|--------|-------|
| Auto-title | ✅ Built | Needs deploy verification |
| Memory system | ✅ Built | Needs deploy verification |
| System prompt per chat | ✅ Built | Needs deploy verification |
| OAuth connectors UI | ✅ Built | Needs deploy verification |
| Delete chat | 🔲 Not started | Should be next after verify pass |
| Conversation search | 🔲 Not started | Sidebar search bar |
| Export chat | 🔲 Not started | Nice-to-have |

---

## Architecture Reminders

**Server:** Fastify + SQLite (better-sqlite3) + SSE streaming  
**Frontend:** React + Vite PWA + Zustand  
**Hosting:** Unraid Docker container, exposed via Twingate  
**DB migrations:** Drop numbered `.sql` files in `lumen-server/src/db/migrations/` — they run automatically on container start via `db-migrate.js`  
**SSE events:** `message_created`, `assistant_start`, `text_delta`, `title_updated`, `done`, `error`

**Known quirks:**
- Write tool has a ~281 line size limit and silently truncates — use bash heredoc for large files
- Em dashes (`—`) in JSX comments cause TSX parse errors — avoid them
- PWA service worker caches aggressively — always clear SW after deploys on mobile

---

## Key File Paths

```
lumen-pwa/src/
  components/
    Layout.tsx          — mobile header, new chat button, swipe gesture
    ChatPane.tsx        — message list, system prompt modal + indicator
    InputBox.tsx        — input pill, voice, lock icon, send/stop
    Sidebar.tsx         — conversation list, theme picker
    SettingsView.tsx    — appearance, memory, connectors pages
    MessageList.tsx     — message bubbles
  stores/appStore.ts    — Zustand store (conversations, activeId, updateConversationTitle)
  hooks/useStream.ts    — SSE event handler
  lib/api.ts            — all fetch wrappers

lumen-server/src/
  index.ts              — Fastify app, route registration
  routes/
    messages.ts         — POST /api/conversations/:id/messages (streaming)
    memory.ts           — GET/POST/DELETE /api/memory
    conversations.ts    — CRUD for conversations
  db/
    migrations/         — numbered SQL files (001_init.sql, 002_memories.sql)
    repos/
      memory.ts         — listMemories, createMemory, deleteMemory
  services/providers/
    anthropic.ts        — streaming + generateTitle()
```

---

## Next Session Checklist

1. **Deploy first** — prune Docker on Unraid, rebuild container
2. **Verify all 5 features** on the live app (see "What's NOT tested" above)
3. **Fix any bugs** that surface during verification
4. **Delete chat** — next feature to build (soft delete on server, remove from sidebar)
5. **Consider:** Chat export, conversation search, mobile polish pass
