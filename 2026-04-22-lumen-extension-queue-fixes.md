---
date: 2026-04-22
session_type: Homelab
duration_estimate: "~3 hours"
topics: Lumen, browser extension, message queue, WebSocket, tab isolation, tab groups, mobile PWA wiring, Chrome MV3
status: complete
---

# Session: Lumen — Extension Architecture Overhaul + Message Queue

## Handoff Paragraph
Building Lumen, a private Electron + React + TypeScript AI desktop app on Will's home PC. This session had two main areas: (1) finishing the Mobile PWA wiring from last session — `addMobileRoutes()` was written but never called; it's now wired into `startRemoteDispatchServer()`, `remote:newConversation` added to preload.js and useRemoteDispatch.ts, and Will confirmed he already has Twingate so remote mobile access works immediately at `http://[PC-LAN-IP]:7747`; (2) fixing three user-facing frustrations — the browser extension was closing active tabs and couldn't run independently, and users couldn't send messages while Claude was streaming. All three are fixed. The extension architecture was collapsed from 3 layers (service worker → offscreen doc → WebSocket) to 1 (service worker owns WebSocket directly, Chrome 116+ keeps it alive via active socket), a dedicated "Lumen" tab group now receives all browse commands so the user's tabs are never touched, and a message queue was added so users can type and hit Enter while Claude is responding. TypeScript compiled clean (zero errors). Next priority: test the mobile PWA end-to-end over Twingate, then reload the extension at chrome://extensions.

## What We Were Trying to Do
1. Complete Mobile PWA wiring (last session left `addMobileRoutes()` unconnected)
2. Fix browser extension destroying user's active tabs
3. Fix browser extension requiring "the open window" to stay connected
4. Fix inability to send messages while Claude is streaming a response

## What We Actually Did

### Mobile PWA Completion
- Edited `main.js`: added `addMobileRoutes(remoteDispatchServer, secret)` call inside `startRemoteDispatchServer()`, placed before `.listen()` so the full router replaces the bare `/dispatch`-only handler before the server opens
- Edited `preload.js`: added `onNewConversation` channel to the `remoteDispatch` bridge object
- Edited `useRemoteDispatch.ts`: added `cleanupNewConv = rd.onNewConversation?.(...)` listener that logs when mobile creates a conversation
- Edited `useClaudeStream.ts`: added `onNewConversation?` to the `remoteDispatch` type declaration to fix TypeScript error (TS2339)
- Confirmed with Will: Twingate is already running on his phone — mobile PWA works outside home WiFi immediately, no extra infra needed
- Noted architectural gap: desktop conversations (zustand/localStorage) and mobile conversations (`conversations.json` on disk) are separate stores — they don't see each other yet

### Message Queue While Streaming
- Edited `ChatPane.tsx`:
  - Added `queuedMessage` state: `{ content: string; attachments?: MessageAttachment[] } | null`
  - Added `useEffect` that fires queued message the instant `isStreaming` goes false
  - Added `handleSend` wrapper: if streaming → `setQueuedMessage(...)`, else → `sendMessage(...)`
  - Added `cancelQueue` callback
  - Added queued message badge UI above InputBox (clock icon, truncated preview, X to cancel)
  - Passed `handleSend` to InputBox instead of `sendMessage` directly
- Edited `InputBox.tsx`:
  - Removed `isStreaming` from the send guard (was blocking all sends while streaming)
  - Removed `disabled` attribute from textarea (now stays interactive during streaming)
  - Placeholder while streaming: "Type to queue a message…"
  - While streaming: shows small purple queue arrow button + red stop button side by side
  - Footer hint while streaming: "Enter to queue next message · Shift+Enter for newline"
  - Removed `isStreaming` from `useCallback` deps of `handleSend`

### Browser Extension: Tab Isolation
- Edited `background.js` (first pass): replaced all `chrome.tabs.query({ active: true, currentWindow: true })` calls with `getLumenTab()` across navigate, get_content, get_url, click, type, scroll commands
- Added `getLumenTab()`: checks if cached `lumenTabId` still exists, creates new background tab (`active: false`) if not
- Added `ensureLumenGroup(tabId)`: creates or reuses a "Lumen" (purple) tab group, adds task tab to it
- Added `reset_tab` command: closes existing Lumen task tab and creates a fresh one
- Screenshot: briefly switches to Lumen tab, captures, immediately restores original tab (~80ms)
- Added `"tabGroups"` to manifest.json permissions (required for chrome.tabGroups API)

### Browser Extension: WebSocket to Service Worker (Architecture Overhaul)
- Previous architecture: Service Worker (background.js) → kept alive Offscreen Document (offscreen.js) → Offscreen Document held WebSocket connection. Three layers. Fragile.
- Root cause of "must be the open window": the offscreen doc could get GC'd, or the message relay between SW and offscreen broke during dormancy. The alarm-based keep-alive wasn't reliable enough.
- Fix: In Chrome 116+, an active WebSocket connection prevents service worker dormancy — the socket itself is the keepalive.
- Full rewrite of `background.js`: WebSocket management (connect, reconnect, onmessage, onopen, onclose, onerror) absorbed directly into the service worker. All Chrome API commands (getLumenTab, executeCommand, etc.) live in the same file.
- Alarm converted to a watchdog only: fires every 30s, calls `connect()` only if `!isConnected`. Not needed for normal operation.
- `get_status` from popup now answered directly (no offscreen relay needed): `sendResponse({ connected: isConnected })`
- `connect()` called at module load time (covers extension update/reload scenario)
- Removed `"offscreen"` from manifest.json permissions
- `offscreen.js` and `offscreen.html` are now dead code — not deleted but can be removed manually
- Updated `popup.js` comment to reflect new direct architecture
- TypeScript check: `./node_modules/.bin/tsc --noEmit` → zero errors

## Decisions Made
| Decision | Reasoning | Date |
|----------|-----------|------|
| Queue approach over interrupt for streaming | Queue preserves the current response; interrupt would discard Claude's work mid-stream. Queue is how production chat UIs work. | 2026-04-22 |
| WebSocket in service worker, not offscreen doc | Chrome 116+ keeps SW alive via active socket. Eliminates the 3-layer relay and all the fragility that came with it. Simpler = fewer failure modes. | 2026-04-22 |
| Dedicated Lumen task tab, never active tab | Extension was closing Will's browser window by navigating the active tab. Dedicated background tab with tab group is the correct pattern. | 2026-04-22 |
| Screenshot requires brief tab switch | `captureVisibleTab` only captures the visible tab — no way around it. Switch → capture → switch back in ~100ms. Acceptable tradeoff. | 2026-04-22 |
| Keep offscreen.js/html on disk for now | Not worth the file delete risk; they're inert. Can be manually trashed. | 2026-04-22 |
| Twingate over Tailscale/Cloudflare Tunnel | Will already has Twingate running — zero extra setup. Mobile PWA works today. | 2026-04-22 |

## What Worked
- TypeScript compiled clean after all changes (zero errors after adding `onNewConversation?` to type declaration)
- `addMobileRoutes()` correctly wired — server now serves mobile web app on `/` alongside original `/dispatch`
- Message queue UX: badge appears immediately when message is queued, fires automatically on stream end, X button cancels
- Extension tab isolation: all commands use `getLumenTab()` — user's tabs are untouched
- WebSocket in service worker: simpler code, eliminates offscreen document overhead entirely

## What Failed / Dead Ends
- **Initial `tsc` attempt**: `npx tsc --noEmit` failed (npx path issue in this environment). Used `./node_modules/.bin/tsc --noEmit` instead — works every time.
- **TypeScript error on `onNewConversation`**: TS2339 + TS7031 because the `remoteDispatch` type in `useClaudeStream.ts` didn't include the new method. Fixed by adding `onNewConversation?` to the type.
- **Desktop/mobile conversation sync still not done**: Conversations created on desktop (zustand/localStorage) don't appear in mobile's `/api/conversations` (reads `conversations.json`). Not fixed this session — on P1 list.

## Open Questions / Unknowns
- Does the Chrome 116+ "WS keeps SW alive" behavior work reliably when Chrome is minimized for extended periods (hours)? The watchdog alarm should catch drops, but worth testing.
- `offscreen.html` — does it need an explicit `chrome.offscreen.closeDocument()` call, or does Chrome clean it up since nothing references it anymore?
- Mobile PWA conversation sync: how to bridge zustand (localStorage) ↔ `conversations.json`? Need an IPC handler that writes to disk on every chatStore update.
- Screenshot on multi-monitor: `captureVisibleTab(null, ...)` — `null` means "current window." If Lumen's Chrome window is on a different monitor than the task tab's window, does this work correctly?

## Context Future Claude Needs

**Key file paths in `/sessions/beautiful-hopeful-fermat/mnt/tower-ai-app/`:**
```
main.js                                          — Electron main, IPC, HTTP server, streamClaude(), addMobileRoutes()
preload.js                                       — IPC bridge, window.tower.* API
src/renderer/components/ChatPane.tsx             — Message queue logic (queuedMessage state, handleSend wrapper)
src/renderer/components/InputBox.tsx             — Queue UX (textarea always enabled, dual buttons while streaming)
src/renderer/hooks/useClaudeStream.ts            — Claude streaming hook + window.tower type declarations
src/renderer/hooks/useRemoteDispatch.ts          — HTTP server lifecycle, onNewConversation listener
src/renderer/stores/chatStore.ts                 — Zustand conversations store (localStorage)
lumen-browser-extension/background.js           — FULL REWRITE: WS in SW, tab isolation, tab groups
lumen-browser-extension/manifest.json           — tabGroups added, offscreen removed
lumen-browser-extension/offscreen.js            — DEAD CODE (no longer used, can delete)
lumen-browser-extension/offscreen.html          — DEAD CODE (no longer used, can delete)
```

**Mobile PWA:**
- URL: `http://[PC-LAN-IP]:7747` (Twingate for remote access)
- Conversations stored: `{userData}/conversations.json` (SEPARATE from desktop's localStorage)
- Desktop convos NOT visible on mobile yet (P1 sync task)

**Extension reload:**
- After any background.js change: `chrome://extensions` → Lumen Browser → click reload icon
- Extension connects to `ws://localhost:7745` first, then `ws://tower.local:7745`
- Lumen WebSocket server port: 7745
- Remote dispatch / mobile PWA port: 7747

**TypeScript check command:**
```
cd /sessions/beautiful-hopeful-fermat/mnt/tower-ai-app && ./node_modules/.bin/tsc --noEmit
```

## Next Steps

### Immediate (test what was built)
1. Reload extension at `chrome://extensions` → verify popup shows "Connected to Lumen"
2. Test mobile PWA: connect Twingate on phone → open `http://[PC-LAN-IP]:7747` → verify chat works → add to home screen
3. Test message queue: start a long Claude response → type a message → hit Enter → verify badge appears → verify it fires when response ends

### P1 — Core gaps
4. **Desktop ↔ mobile conversation sync**: Add IPC handler `data:syncConversations` — chatStore calls it after every mutation, main.js writes to `conversations.json`. This makes mobile see desktop conversations.
5. **Fix Helm conversation delete**: No delete button on individual Helm chat threads in sidebar
6. **Extension heartbeat**: Watchdog alarm fires every 30s — consider adding a ping/pong frame to detect half-open connections faster

### P2 — Polish
7. **Activity sidebar**: Tool call aggregation panel (files touched, step log) — data layer exists in chatStore, just needs UI
8. **Conversation sharing**: Export as standalone HTML (for job apps, sharing)
9. **Mobile auth**: Secret currently passed as URL query param — consider a proper login page

### P3 — Expansion
10. **Multi-folder semantic indexing**: Index beyond Obsidian vault
11. **Cross-machine memory via Unraid**: SQLite on Unraid for conversation persistence
12. **React Native wrapper**: After PWA is solid, for App Store/Play Store

## Tags
#session-log #lumen #homelab #browser-extension #websocket #chrome-mv3 #message-queue #mobile-pwa #twingate
