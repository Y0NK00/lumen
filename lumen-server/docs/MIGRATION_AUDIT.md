# Lumen Server Migration Audit

**Source:** `main.js` (2579 lines) + `preload.js` (187 lines)
**Target:** `lumen-server/` headless Node.js service
**Date:** 2026-04-23

## Summary

| Category | Handler Count | Disposition |
|---|---|---|
| Core LLM + streaming | 2 | EXTRACT (rewrite for multi-user) |
| Data (conversations, settings, connectors) | 6 | REPLACE (REST endpoints + SQLite) |
| Vault / Obsidian integration | 8 | EXTRACT (per-user vault paths) |
| Scheduled tasks (cron) | 4 | EXTRACT (per-user tasks) |
| Browser extension WS bridge | 1 | EXTRACT (server-side) |
| Google OAuth | 1 | REPLACE (per-user OAuth tokens) |
| Electron window controls | 5 | DELETE (client-side now) |
| File dialogs | 1 | DELETE (no server GUI) |
| Filesystem access (`fs:*`) | 3 | **DELETE (security risk)** |
| Terminal (`terminal:run`) | 1 | **DELETE (critical security risk)** |
| BrowserView (driver/code panes) | 10 | DELETE (Electron-only) |
| HTTP server + mobile PWA | 2 | REPLACE (becomes the main server) |

## Known Bug Found During Audit

**Duplicate `addMobileRoutes()` definition:** Lines 1114 and 1819 of `main.js` both declare `function addMobileRoutes()`. The second shadows the first. This is dead code and should be cleaned up during extraction. Only the second (line 1819) is actually the version in use.

## Detailed Handler Disposition

### EXTRACT (port to lumen-server with modifications)

| Handler / Function | Line | Notes for extraction |
|---|---|---|
| `streamClaude()` | 657 | Core LLM. Needs: user context, token counting, budget check before call, usage_events write after completion. |
| `executeTool()` | 467 | Tool execution. Needs per-user permission checks. |
| `executeBrowserCommand()` | 217 | WS to browser extension. Needs per-user WS routing (each user has own extension WS). |
| `addMobileRoutes()` (line 1819 version) | 1819 | Becomes the main HTTP API router. Expand massively. |
| `startRemoteDispatchServer()` | 1403 | Becomes the main server bootstrap. |
| Vault: `readFile`, `writeFile`, `listFiles`, `search`, `getStats`, `buildIndex`, `semanticSearch`, `indexMeta`, `clearIndex` | 2060-2368 | Each user has a vault path setting. Enforce path isolation per-user. |
| `embedText()` (Ollama) | 2224 | Unchanged. Ollama endpoint is shared. |
| `cronRunTask`, `cronRegisterTask`, `cronUnregisterTask` | 981-1076 | Cron tasks belong to users. Task runs execute in user context. |
| `readJSON`, `writeJSON` | 21-26 | Utility only. Will be replaced by SQLite repo functions for data, kept for config files. |

### REPLACE (rewrite for multi-user + REST)

| Handler | Line | Replacement |
|---|---|---|
| `data:loadConversations` | 2449 | `GET /api/conversations` (scoped to user_id) |
| `data:saveConversations` | 2450 | `POST /api/conversations`, `PATCH /api/conversations/:id`, `DELETE /api/conversations/:id` |
| `data:loadSettings` | 2451 | `GET /api/settings` (per-user row in users table) |
| `data:saveSettings` | 2452 | `PATCH /api/settings` |
| `data:loadConnectors` | 2459 | `GET /api/connectors` (per-user) |
| `data:saveConnectors` | 2460 | `PATCH /api/connectors` |
| `claude-stream-start` (IPC) | 917 | `POST /api/conversations/:id/send` → SSE stream |
| `claude-stream-abort` (IPC) | 931 | `POST /api/conversations/:id/abort` |
| `connect-google` | 2469 | `GET /api/oauth/google/start` + `GET /api/oauth/google/callback` (per-user token storage) |
| `remote:start`, `remote:stop`, `remote:getIPs` | 1446-1452 | N/A. Server is always running on Unraid. Delete these. |

### DELETE (not needed or security risk on server)

| Handler | Line | Why delete |
|---|---|---|
| `win:minimize`, `win:maximize`, `win:close`, `win:openConversation` | 2384-2434 | Electron window controls. Handled by Electron client locally. |
| `dialog:openFolder` | 2438 | Server has no GUI. Clients handle local folder picks or users set paths via settings UI. |
| `fs:readFile`, `fs:writeFile`, `fs:listDir` | 2484-2492 | **SECURITY:** Arbitrary filesystem access must not be exposed as an API. Replace with scoped vault endpoints. |
| `terminal:run` | 2475 | **SECURITY:** Arbitrary shell execution must NEVER be exposed as a multi-user API. Delete entirely. If needed for admin, make it admin-only and log every call. |
| `driver:*` (init/show/hide/setBounds/reload/navigate) | 2504-2541 | BrowserView is Electron-only. Clients render their own iframes if needed. |
| `code:*` (init/show/hide/setBounds/reload) | 2544-2580 | Same. |
| `createWindow()` | 102 | Electron-only. |
| Duplicate `addMobileRoutes()` at line 1114 | 1114 | Dead code. Remove. |
| `main.js.v1-backup` | - | Stale backup file. Delete. |

## Dependencies to Carry Over

From `main.js` requires:
- `path`, `fs` — keep (server still reads/writes files)
- `child_process` — keep ONLY for controlled admin operations, NOT exposed as API
- `googleapis` — keep (per-user OAuth)
- `ws` — keep (WebSocket server for extension + real-time client events)
- `node-cron` — keep (scheduled tasks)
- Drop `electron`

Add new to `lumen-server/package.json`:
- `express` or `fastify` — HTTP server (recommend fastify: faster, better TS support)
- `better-sqlite3` — SQLite driver (synchronous, excellent for this use case)
- `bcrypt` — password hashing
- `jsonwebtoken` — JWT signing
- `zod` — request validation
- `dotenv` — env config
- `pino` + `pino-pretty` — structured logging
- `@anthropic-ai/sdk` — official Claude SDK (handles retries, streaming)
- `resend` — email sending

## Data Migration Strategy

Existing data on Will's PC:
- `{userData}/conversations.json` — desktop conversations (via readJSON)
- `{userData}/mobile-conversations.json` — mobile conversations (separate file!)
- `{userData}/settings.json` — single-user settings
- `{userData}/connectors.json` — connectors config
- `{userData}/google_token.json` — Google OAuth token

**Migration script needed:** `lumen-server/scripts/migrate-from-electron.js`
- Reads these JSON files from a given path
- Creates Will's admin user in SQLite
- Imports all conversations under his user_id
- Imports settings into users row
- Imports OAuth token into oauth_tokens table

Run this ONCE on first Unraid deploy. Keep the JSON files as backup.

## Open Questions for Will

1. **Do we ship the desktop Electron app as a thin client, or deprecate it in favor of the PWA?**
   - Answered: Option A confirmed. Electron stays as thin client. Its code will be gutted and rewritten to call the server API.

2. **Who is admin?** Only Will. Everyone else is a regular user.

3. **Vault path per-user?** Each user can set their own vault path in settings. Server enforces that the path is inside an allowlist directory (e.g., `/mnt/user/lumen-vaults/{userId}/`).

4. **Browser extension per-user?** Yes. Each user's Chrome installs the extension and authenticates with a personal token. WS connections are tagged with user_id so browse commands route to the right user's browser.
