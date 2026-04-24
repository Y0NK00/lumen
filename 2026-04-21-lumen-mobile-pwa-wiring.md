---
date: 2026-04-21
session_type: Homelab
duration_estimate: "~4-5 hours"
topics: Lumen, Electron, Mobile PWA, Ollama RAG, Remote Dispatch, Drag and Drop, Settings Bug Fix, Projects CRUD, Model Switcher
status: complete
---

# Session: Lumen Build — Mobile PWA Wiring + Feature Blitz

## Handoff Paragraph
Building Lumen — a private Electron + React + TypeScript AI desktop app running on Will's home PC. This session completed a large feature set: fixed a critical bug where the API key cleared on every restart (settings was overwriting instead of merging), rebuilt the Projects section in Helm from a dead placeholder to full CRUD, added full-pane drag-and-drop for file/image attachments (images render inline, text inlined as content blocks, PDFs as base64), added a model switcher in the conversation header, a token budget badge, conversation export to clipboard/vault, and the full Mobile PWA companion. The PWA is served from Lumen's existing HTTP server (port 7747) — mobile hits `http://[PC-LAN-IP]:7747`, gets a dark-themed single-file web app with SSE streaming, conversation list, and PWA manifest so it can be added to the home screen. Tonight's final wiring: `addMobileRoutes()` called inside `startRemoteDispatchServer()` in main.js, `remote:newConversation` added to preload.js, and the listener added in `useRemoteDispatch.ts`. Will already uses Twingate — mobile PWA works outside home WiFi immediately with no extra setup needed.

## What We Were Trying to Do
Build Lumen to match (and eventually beat) Claude.ai as Will's daily driver AI app, adding:
1. Obsidian vault RAG with semantic search via Ollama nomic-embed-text
2. Remote dispatch server (phone can POST tasks to Lumen)
3. Mobile PWA companion so Will can chat with Claude from his phone through Lumen
4. Full file/image drag-and-drop into chat
5. Fix API key clearing on restart

## What We Actually Did

### API Key Persistence Bug Fix
- Root cause: `ipcMain.handle('data:saveSettings', ...)` was doing `writeJSON(settingsFile, patch)` — overwriting the entire settings file with only the changed fields
- Fix: `const existing = readJSON(settingsFile, {}); writeJSON(settingsFile, { ...existing, ...patch })`
- This is a merge-on-write pattern — now all settings persist correctly across restarts

### Obsidian Vault RAG
- Added `vaultRagEnabled`, `vaultEmbedModel` (`nomic-embed-text`) to settingsStore
- `buildVaultBlock(query)` in memoryStore: tries semantic search first, falls back to keyword search
- Vault context injected as `<vault_context>` XML block with relevance scores
- Semantic index: pure JS cosine similarity, no native addons, index saved to `{userData}/vault-index.json`
- Ollama embedding endpoint: `http://10.0.0.22:11434` — that's the Unraid HOST IP with port forwarding, NOT the Docker container IP (172.17.0.10)
- nomic-embed-text successfully pulled and running on Unraid

### Remote Dispatch Server
- HTTP server on port 7747, `POST /dispatch` accepts `{ text, secret? }`
- Server lifecycle managed in `useRemoteDispatch.ts` hook
- Renderer listens for `remote:dispatch` IPC, creates new conversation, emits DOM event for ChatPane

### Drag-and-Drop Attachments
- Problem: drag zone was only on the InputBox strip at the bottom — too small
- Fix: moved drag handlers to ChatPane level (full-pane drop zone)
- Used `dragCounterRef` counter pattern (++/--) to prevent flicker when cursor crosses child elements
- Exported `processDroppedFiles()` from InputBox.tsx so ChatPane can call it on pane-level drops
- Images: base64 → Claude vision block `{ type: 'image', source: { type: 'base64', media_type, data } }`
- Text/CSV/MD: read as plain text, injected as text content block
- PDFs: base64, sent to Claude vision (handles PDFs too)
- DOCX: unsupported for now (no parser without a library)
- Attachment preview chips in InputBox with remove button
- MessageList renders attachments inline in user bubbles

### Helm Projects — Full CRUD
- `ProjectsContent()` in HelmPane.tsx was a completely dead placeholder with a hardcoded non-functional button
- Rebuilt to full CRUD: create/edit/delete projects with name, emoji, working folder, system prompt
- Browse button triggers folder picker via `tower.dialog.openFolder()`
- Active project badge, syncs `rootPath` to main via `tower.syncRootPath()`

### Model Switcher + Token Budget Alert
- Dropdown in ConversationHeader: Opus 4.6, Sonnet 4.6, Haiku 4.5
- Token budget badge shows at ≥80% usage

### Conversation Export
- `handleExport('clipboard'|'vault')` in ChatPane builds clean markdown
- Export button: left-click = copy to clipboard, right-click = save to vault

### Mobile PWA — Full Implementation
- `streamClaude()` extracted as shared callback-based function in main.js
  - Args: `{ messages, model, apiKey, systemPrompt, signal, onChunk, onToolStart, onToolResult, onDone, onError }`
  - Used by both the IPC handler (desktop) and the SSE HTTP handler (mobile)
- `getMobileAppHTML()`: complete single-file mobile web app (vanilla JS, dark theme #0a0a14, SSE client, markdown renderer, PWA-ready)
- `getPWAManifest()`: PWA manifest JSON
- `addMobileRoutes(server, secret)`: replaces server request listener with full mobile + dispatch router
  - `GET /` → mobile web app HTML
  - `GET /manifest.json` → PWA manifest
  - `GET /api/status` → `{ ok, model }`
  - `GET /api/conversations` → list from `conversations.json`
  - `GET /api/conversations/:id` → single conversation
  - `POST /api/conversations` → create, notifies renderer via `remote:newConversation`
  - `POST /api/conversations/:id/message` → SSE stream via `streamClaude()`
  - `POST /dispatch` → original remote dispatch preserved
- **TONIGHT**: wired `addMobileRoutes(remoteDispatchServer, secret)` call inside `startRemoteDispatchServer()` in main.js (before `.listen()`)
- **TONIGHT**: added `remote:newConversation` IPC channel to preload.js
- **TONIGHT**: added `onNewConversation` listener in `useRemoteDispatch.ts`

### Twingate
- Will already uses Twingate — mobile PWA works outside home WiFi immediately
- No Tailscale or Cloudflare Tunnel needed
- On phone: connect Twingate → open `http://[PC-LAN-IP]:7747` → add to home screen

## Decisions Made

| Decision | Reasoning | Date |
|----------|-----------|------|
| Use Unraid host IP `10.0.0.22:11434` for Ollama | Container IP `172.17.0.10` is internal; host IP + port forwarding is the right network path | 2026-04-21 |
| PWA first, not React Native | PWA is zero-cost, instant, works via Twingate; React Native requires Apple Developer account + App Store process | 2026-04-21 |
| Shared `streamClaude()` callback function | Desktop and mobile needed same streaming logic — extracting it prevents drift and duplication | 2026-04-21 |
| Counter-based drag tracking (`dragCounterRef`) | Standard `dragLeave` fires on child elements causing flicker — counter fix is the correct pattern | 2026-04-21 |
| Mobile conversations stored separately in `conversations.json` | Quickest path to working mobile; desktop uses zustand/localStorage — syncing them is a separate task | 2026-04-21 |
| Merge-on-write for settings | Any write that doesn't merge will silently delete other settings including API key | 2026-04-21 |

## What Worked
- API key now persists across restarts after merge-on-write fix
- Full-pane drag-and-drop with no flicker using counter pattern
- nomic-embed-text pulled and running on Unraid (`http://10.0.0.22:11434`)
- `addMobileRoutes()` correctly replaces the bare `/dispatch`-only handler with full router while preserving `/dispatch`
- SSE streaming from mobile via shared `streamClaude()` function
- Twingate already covers remote access — no additional infra needed

## What Failed / Dead Ends
- **DOCX uploads**: no parser in-browser without a library — returns `null`, user gets "unsupported type" error. Left as known limitation.
- **Claude chat design prompt confusion**: Sent the mobile feature design template without filling in the specific feature. Claude chat asked "what do you want to build?" — the prompt needed a concrete feature appended at the end.
- **`npx tsc --noEmit` not found**: Used `./node_modules/.bin/tsc --noEmit` instead. npx path resolution issue in this environment.
- **Desktop/mobile conversation sync**: Conversations created on desktop (zustand/localStorage) don't appear in mobile's `/api/conversations` (reads `conversations.json`). Not the same store. This is a known architectural gap — not fixed this session.

## Open Questions / Unknowns
- Does `conversations.json` get populated from the desktop's zustand store, or do they diverge? Need to add a sync IPC handler that writes to disk whenever chatStore updates.
- Should the mobile app read the API key from `cronSettings.apiKey` (which mirrors settings)? What if `cronSettings` isn't populated on startup before the user opens the renderer?
- Multi-folder semantic indexing: only vault path indexed now, not arbitrary folders.

## Context Future Claude Needs

**Key file paths:**
- `main.js` — Electron main process, all IPC handlers, HTTP server, `streamClaude()`, `addMobileRoutes()`, vault ops
- `preload.js` — IPC bridge, `window.tower.*` API surface
- `src/renderer/stores/chatStore.ts` — Zustand store for conversations + messages
- `src/renderer/stores/settingsStore.ts` — Zustand store for all settings (API key, model, vault path, etc.)
- `src/renderer/stores/memoryStore.ts` — Vault RAG, `buildVaultBlock(query)`
- `src/renderer/components/InputBox.tsx` — Chat input, attachments, exported `processDroppedFiles()`
- `src/renderer/components/ChatPane.tsx` — Full-pane drop zone, model switcher, export, token badge
- `src/renderer/components/HelmPane.tsx` — Helm agents + Projects CRUD
- `src/renderer/hooks/useClaudeStream.ts` — Claude streaming hook, attachment → content block conversion
- `src/renderer/hooks/useRemoteDispatch.ts` — HTTP server lifecycle, incoming message dispatch

**Ollama Unraid:**
- Host IP: `10.0.0.22`
- Port: `11434`
- Embedding model: `nomic-embed-text` (768 dims)
- Endpoint: `http://10.0.0.22:11434/api/embeddings`

**Remote Dispatch / Mobile PWA:**
- Port: `7747`
- Secret: user-configured in Settings
- Mobile URL: `http://[PC-LAN-IP]:7747` (Twingate for remote)
- Mobile conversations stored in: `{userData}/conversations.json` (separate from zustand localStorage)

**Current models configured:**
- Claude Sonnet 4.6 (default), Opus 4.6, Haiku 4.5

## Next Steps

### P1 — Complete Core Stability
1. **Sync desktop conversations to `conversations.json`**: Add IPC handler `data:syncConversations` — chatStore calls it after every update, main.js writes to disk. This makes mobile see desktop convos.
2. **Add `remote:newConversation` renderer handler**: When mobile creates a conversation, reload chatStore from disk so it appears in sidebar (requires implementing the sync above first).
3. **Fix Helm conversation delete**: No delete button on Helm chat threads in sidebar — add it.
4. **Browser extension heartbeat**: WebSocket has no ping/pong — add 30s keepalive so extension reconnects on drop.

### P2 — Mobile Polish
5. **Test mobile PWA end-to-end**: Open `http://[PC-IP]:7747` on phone via Twingate, verify SSE streaming works, add to home screen.
6. **Mobile auth**: Currently secret is in URL `?secret=xxx` — consider a login page instead.
7. **Conversation sharing**: Export as standalone HTML file (for job applications, sharing results).
8. **Mobile shows desktop conversations**: Requires P1 sync step above.

### P3 — Expansion
9. **Multi-folder semantic indexing**: Index beyond Obsidian vault — Desktop, Downloads, project folders.
10. **Cross-session memory via Unraid**: SQLite on Unraid for cross-machine conversation history.
11. **Resume/file context mode**: Persistent file context per project (upload resume once, referenced in every message).
12. **React Native wrapper**: Post-PWA, for App Store / Play Store (requires Apple Developer account ~$99/yr).

## Tags
#session-log #lumen #homelab #electron #mobile-pwa #ollama #rag #remote-dispatch #twingate
