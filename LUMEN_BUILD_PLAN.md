# Lumen AI — Build Plan

> Last updated: 2026-05-03

> **PWA desktop shell (Claude-style header):** Implemented 2026-05-03 — see **`SESSION_HANDOFF.md`**. Remaining PWA polish (hover/a11y/sidebar) remains in **`UI_HANDOFF.md`**.

---

## Section 1: Cursor Session Startup Prompt

Paste this block at the start of a Cursor session to orient it on the codebase instantly.

```
You are working on Lumen AI — a self-hosted, multi-user AI chat platform built on:

TECH STACK
- Server: Node.js 20 + Fastify 4 + TypeScript, SQLite (better-sqlite3 WAL mode)
- Client: React 18 + TypeScript + Vite, Tailwind CSS 4, Zustand 4 state management, PWA
- AI: @anthropic-ai/sdk 0.30 — SSE streaming, prompt caching, model selection per conversation
- Auth: JWT (jsonwebtoken) + bcrypt + sessions revocation table
- Extension: Chrome MV3 service-worker WebSocket bridge
- Deployment: Docker + Unraid, SQLite at /data/lumen.db, PWA served from ./public/

KEY FILE LOCATIONS
- Server entry:       lumen-server/src/index.ts
- Server routes:      lumen-server/src/routes/*.ts  (auth, conversations, messages, settings, usage, admin, oauth, memory, extension)
- DB schema:          lumen-server/src/db/schema.sql  (13 tables: users, sessions, projects, conversations, messages, attachments, usage_events, oauth_tokens, extension_tokens, scheduled_tasks, audit_log, vault_chunks, memories)
- Migrations:         lumen-server/src/db/migrations/001_init.sql, 002_memories.sql
- Auth middleware:    lumen-server/src/middleware/auth.ts  (requireAuth, requireAdmin)
- Budget middleware:  lumen-server/src/middleware/budget.ts  (blocks if monthly spend >= limit)
- Pricing:            lumen-server/src/services/pricing.ts
- Anthropic service:  lumen-server/src/services/providers/anthropic.ts  (streaming, tool use stub)

- Client entry:       lumen-pwa/src/App.tsx
- Stores:             lumen-pwa/src/stores/appStore.ts | authStore.ts | themeStore.ts
- API client:         lumen-pwa/src/lib/api.ts  (typed fetch wrapper + Bearer token injection)
- Stream client:      lumen-pwa/src/lib/stream.ts  (custom SSE parser — EventSource can't send auth headers)
- Key components:     lumen-pwa/src/components/
    ChatPane.tsx       — message area + input orchestration
    MessageList.tsx    — bubbles, markdown, resend button, starter chips
    InputBox.tsx       — textarea, voice input (Web Speech API), send/stop buttons
    Sidebar.tsx        — conversation list, delete button, theme picker, settings nav
    SettingsView.tsx   — profile, appearance, memory, connectors (OAuth), billing tabs
    Layout.tsx         — sidebar + main pane frame, mobile swipe-to-open, visual viewport hook

- Extension files:    lumen-browser-extension/background.js | popup.js | popup.html | offscreen.js | manifest.json

STREAMING PROTOCOL (SSE)
POST /api/conversations/:id/messages  → SSE stream
Events: message_created | assistant_start | text_delta | usage | title_updated | done | error
Client batches text_delta at ~30fps via requestAnimationFrame to prevent mobile Safari jank.

DATABASE CONVENTIONS
- All IDs are nanoid strings (not auto-increment integers)
- Soft deletes via deleted_at timestamp — nothing is hard-deleted except by admin
- usage_events records input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd per message
- schema_version table tracks applied migrations (integer version column)

AUTH FLOW
- POST /api/auth/login → { token (JWT), user } — token stored in localStorage, injected as Bearer on every request
- JWT payload: { sub: userId, role, jti } — jti checked against sessions table for revocation
- Extension tokens: long-lived tokens in extension_tokens table (token_hash stored, raw token shown once)

KNOWN CONSTRAINTS / GOTCHAS
- Write tool silently truncates large files (~281 lines) — use bash heredoc for files over 200 lines
- Em dashes (—) inside JSX comments break TSX parsing — use regular hyphens in JSX comments
- PWA service worker aggressively caches on mobile — clear after deploys (Settings → Clear site data)
- Zustand: never spread store arrays in useEffect deps — creates infinite loops
- SQLite WAL mode is set at startup; do not change journal_mode at runtime
- The budget middleware runs BEFORE the Anthropic call but AFTER auth — do not move it
- CORS origins are comma-separated in CORS_ORIGINS env var; trailing spaces will break matching

WHAT IS NOT YET BUILT (see LUMEN_BUILD_PLAN.md for full task list)
- Projects CRUD routes + sidebar grouping UI (DB table exists, no routes/UI)
- File/document management (server file API, file browser UI, Claude tool use)
- Conversation search (no FTS index or search route yet)
- Budget threshold email alerts (Resend installed but not wired)
- Scheduled task execution engine (table exists, node-cron installed, no runner)
- Attachment upload/download endpoints (table exists, no handlers)
- Vault / semantic search (table exists, no embedding code)
```

---

## Section 2: What's Already Built

### Core Chat
- **SSE streaming** — POST to `/api/conversations/:id/messages`, streams `text_delta` events. Client batches at ~30fps to prevent mobile jank. Abort via `/abort` endpoint.
- **Model selection** — per-conversation; Opus 4, Sonnet 4, Haiku 4.5 supported, stored in conversations table.
- **Auto-title** — first message triggers a Haiku call to generate a 4–6 word title; fires `title_updated` SSE event so the sidebar updates without a reload.
- **Starter chips** — four suggestion buttons on empty chat state, wired to `handleSend`.

### Auth & Users
- **JWT auth** with sessions revocation table. Login, logout, `/me` endpoint.
- **Multi-user** — full user table with role (`user` | `admin`), monthly budget, disabled flag.
- **Admin panel** — user CRUD, cross-user spend breakdown, audit log query.
- **Bootstrap admin** — first-run creates admin from `ADMIN_BOOTSTRAP_*` env vars.

### Conversations
- **Full CRUD** — list (cursor-paginated, filterable by project_id), create, get (with messages), update (title, model, systemPrompt, projectId), soft delete.
- **System prompts** — per-conversation or global default; editable via modal in ChatPane; lock icon shows when active.
- **Per-conversation cost** — displayed in sidebar via `getConversationCostUsd`.

### Memory & Context
- **Memory system** — user-defined snippets (max 2000 chars each) injected into every message as a system context block. CRUD via `/api/memory`.
- **Settings** — persistent user settings blob (theme, defaultModel, sendOnEnter, displayName, etc.) via `/api/settings`.

### Theming
- **9 themes** — Lumen (default), Eclipse, Nord, Dracula, Solarized Light, Rose Pine, Catppuccin, Tokyo Night, Gruvbox. CSS variable injection at `document.documentElement.style`. Theme persisted in settings.

### Token/Cost Tracking
- **Per-message usage** recorded in `usage_events` (input, output, cache-read, cache-write tokens + cost_usd).
- **Monthly summaries** — model breakdown, cache savings, total spend vs. budget.
- **Hard budget enforcement** — `checkBudget` middleware blocks requests once monthly spend >= user's limit.

### OAuth
- **Google OAuth (PKCE)** — full flow: start → Google consent → callback → token stored in `oauth_tokens`. Status check and disconnect endpoints. UI in Settings → Connectors.

### Browser Extension
- **Chrome MV3 service worker** — persistent WebSocket to Lumen server (`/ws/extension`), authenticated via JWT token stored in `chrome.storage.local`.
- **Dedicated task tab** — all browser commands target an isolated "Lumen" purple tab group, never the user's active tab.
- **Full command set** — `navigate`, `click`, `type`, `screenshot`, `scroll`, `get_content`, `get_url`, `get_tabs`, `switch_tab`, `reset_tab`.
- **Token setup UI** — popup.html lets users paste their extension token; saved to `chrome.storage.local`.

### Mobile / PWA
- **PWA manifest** — installable on Android/iOS, offline caching via Vite PWA plugin.
- **iOS keyboard handling** — `useVisualViewport` adjusts `--viewport-height` CSS variable when keyboard opens/closes.
- **Swipe to open sidebar** — swipe-right gesture on chat area opens sidebar on mobile.
- **Voice input** — Web Speech API with continuous mode; pre-existing text preserved.

### Infrastructure
- **Docker** — multi-stage build, SQLite volume-mounted at `/data`, PWA copied at build time.
- **Migrations** — numbered SQL files applied at startup via migration runner.
- **Sentry** — optional error tracking via `SENTRY_DSN` env var.
- **Pino logging** — structured JSON logs in production, pretty-print in development.

---

## Section 3: Remaining Tasks (Priority Order)

---

### Task 1 — Projects Feature

**Goal:** Allow users to group conversations into named projects. Each project can have its own system prompt (acts as a default for new conversations in that project). Pinned projects appear at the top of the sidebar.

**DB status:** `projects` table already exists (`id`, `user_id`, `name`, `system_prompt`, `pinned`, `deleted_at`). `conversations.project_id` foreign key exists. `GET /api/conversations` already accepts `?project_id=` filter.

**Files to create/modify:**
- `lumen-server/src/db/repos/projects.ts` *(new)* — `listProjects`, `createProject`, `getProjectById`, `updateProject`, `softDeleteProject`
- `lumen-server/src/routes/projects.ts` *(new)* — CRUD routes: `GET /api/projects`, `POST /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`
- `lumen-server/src/index.ts` — register `projectRoutes`
- `lumen-pwa/src/lib/api.ts` — add `listProjects`, `createProject`, `updateProject`, `deleteProject` functions
- `lumen-pwa/src/stores/appStore.ts` — add `projects` array, `activeProjectId`, setters
- `lumen-pwa/src/components/Sidebar.tsx` — add project grouping: collapsible project headers above their conversations, "+ New Project" button, project context menu (rename, delete, pin)
- `lumen-pwa/src/components/ChatPane.tsx` — show project name in conversation header; when creating a new conversation inside a project, pass `projectId`

**Technical notes:**
- The `listProjects` query should order by `pinned DESC, name ASC`.
- When a project has a `system_prompt`, new conversations created under it should inherit it as their default `system_prompt` (can be overridden per-conversation).
- Soft delete a project should NOT cascade to conversations — conversations become "unassigned" (`project_id = null`), not deleted.
- For the sidebar, render "No Project" as an implicit group for conversations where `project_id IS NULL`.

**Gotchas:**
- The conversation list endpoint already supports `project_id` filter — use it to lazily load conversations per-project rather than loading everything upfront.
- `pinned` is a boolean column — in better-sqlite3, SQLite returns 0/1; coerce to boolean in the repo layer.

---

### Task 2 — File / Document Management

**Goal:** Let users upload, browse, and manage files (txt, md, docx, pdf, images). More importantly, give Claude the ability to create, read, and edit files on behalf of the user via Anthropic tool use — so the AI can write a document, save it, and the user can download it.

This is three sub-systems:

#### 2a — Server File API

**Files to create/modify:**
- `lumen-server/src/routes/files.ts` *(new)* — REST endpoints:
  - `POST /api/files/upload` — multipart form upload; stores file at `DATA_DIR/files/<userId>/<fileId>.<ext>`, inserts row in `attachments` table with `kind` = `file` | `image`
  - `GET /api/files` — list user's files (from `attachments` table, where `message_id IS NULL` for standalone files)
  - `GET /api/files/:id` — stream file content back (with correct MIME type)
  - `DELETE /api/files/:id` — soft delete (set `deleted_at`) + optionally remove from disk
  - `POST /api/files/:id/content` — overwrite file content (for AI-edited files)
- `lumen-server/src/index.ts` — register `fileRoutes`; install `@fastify/multipart` plugin

**Technical notes:**
- Use `DATA_DIR` env var (already used for the SQLite path) as storage root — `path.join(process.env.DATA_DIR, 'files', userId, fileId)`.
- For the `attachments` table: the existing schema has `message_id` as a foreign key. Add a nullable `message_id` so standalone (non-message) files also live there. May need migration 003.
- Add a `filename`, `mime_type`, and `size_bytes` column to `attachments` if not present (check schema.sql).
- Read file as stream via `fs.createReadStream` — don't load into memory for large files.

**Gotchas:**
- `@fastify/multipart` needs to be registered before routes that use it.
- Set reasonable file size limits (e.g. 50MB) to prevent runaway uploads.
- For DOCX/PDF read: use `mammoth` (DOCX → text) or `pdf-parse` (PDF → text) server-side for Claude to read the content.

#### 2b — File Browser UI Component

**Files to create/modify:**
- `lumen-pwa/src/components/FileBrowser.tsx` *(new)* — grid/list of user's files with icons by type, upload button, download link, delete button. Shows file name, size, upload date.
- `lumen-pwa/src/components/SettingsView.tsx` — add a "Files" tab that renders `<FileBrowser />`
- `lumen-pwa/src/lib/api.ts` — add `listFiles`, `uploadFile`, `deleteFile`, `getFileUrl` functions

#### 2c — Claude Tool Use Integration

**Goal:** Wire up Anthropic tool use so Claude can actually create/read/edit files during a conversation. The user says "write me a marketing plan" — Claude calls `create_file`, the server saves it, the SSE stream emits a `tool_result` event with the download link.

**Files to create/modify:**
- `lumen-server/src/services/providers/anthropic.ts` — add tool definitions array:
  ```
  read_file(file_id: string) → returns file text content
  create_file(filename: string, content: string) → saves file, returns file_id + download URL
  edit_file(file_id: string, new_content: string) → overwrites file content
  list_files() → returns user's file list
  ```
- `lumen-server/src/routes/messages.ts` — in the streaming handler, pass tools array to the Anthropic API call; handle `tool_use` content blocks by executing the appropriate file operation server-side; inject `tool_result` back into the message array and continue the stream.
- Add `tool_use` and `tool_result` SSE event types so the client can render tool calls as collapsed blocks in the message list.
- `lumen-pwa/src/components/MessageList.tsx` or `MarkdownRenderer.tsx` — render `tool_use` blocks as collapsible "Claude used a tool" UI with result preview; render created files as download cards.

**Technical notes:**
- Anthropic tool use requires sending the full `messages` array including `tool_use` + `tool_result` content blocks on subsequent turns — the messages repo must store `content_json` as a JSON array (which it already does) and the messages route must reconstruct the full content array when building the API payload.
- Start with just `create_file` and `read_file` — those two unlock 80% of the value.
- Tool use is NOT compatible with streaming in a single request — use `stream: false` for tool-use turns, then continue streaming the follow-up response.

**Gotchas:**
- The Anthropic API returns `stop_reason: 'tool_use'` when it wants to call a tool. The server must detect this, execute the tool, and re-submit the conversation with the tool result before streaming the final response. This makes the message route stateful across multiple API calls — structure it carefully.
- Tool results can be large (full file content) — truncate at ~10,000 tokens for `read_file` to avoid blowing the context window.

---

### Task 3 — Conversation Search

**Goal:** Search bar in the sidebar that searches conversation titles and message content, returning matching conversations with the matching snippet highlighted.

**Files to create/modify:**
- `lumen-server/src/db/migrations/003_search.sql` *(new or add to 003)* — create FTS5 virtual table:
  ```sql
  CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
    title, content='conversations', content_rowid='rowid'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content_text, content='messages', content_rowid='rowid'
  );
  ```
  Plus triggers to keep FTS tables in sync on insert/update/delete.
- `lumen-server/src/routes/search.ts` *(new)* — `GET /api/search?q=<query>&limit=20` — queries both FTS tables, joins back to conversations, returns `{conversationId, title, snippet}` array.
- `lumen-server/src/index.ts` — register `searchRoutes`
- `lumen-pwa/src/lib/api.ts` — add `searchConversations(q: string)` function
- `lumen-pwa/src/components/Sidebar.tsx` — add search input at the top; on type (debounced 300ms), call `searchConversations` and render results replacing the normal conversation list; clear to return to normal list.

**Technical notes:**
- FTS5 `snippet()` function returns highlighted matching text — use it for the preview snippet.
- For messages, the `content_json` column stores a JSON array — extract the plain text value before indexing. Either use a generated column or index at insert time via triggers.
- Debounce the search input in the UI (300ms) — don't fire a request on every keystroke.

**Gotchas:**
- `content_json` is a JSON array `[{type, text}]` in the messages table. The FTS trigger needs to extract the text from it. Use `json_extract(content_json, '$[0].text')` or iterate — but SQLite FTS triggers can't call JSON functions directly. Easier: add a `content_text TEXT GENERATED ALWAYS AS (json_extract(content_json, '$[0].text')) VIRTUAL` column to messages, then index that.
- FTS5 requires SQLite 3.9+ (fine for any modern system) but `better-sqlite3` must have been compiled with FTS5 support — it is by default.

---

### Task 4 — Budget Threshold Email Alerts

**Goal:** When a user's monthly spend crosses 80% of their budget, send them an email via Resend. The `checkBudget` middleware already has a TODO stub for this.

**Files to create/modify:**
- `lumen-server/src/lib/email.ts` *(new)* — Resend client wrapper:
  ```ts
  import { Resend } from 'resend';
  const resend = new Resend(process.env.RESEND_API_KEY);
  export async function sendBudgetAlert(toEmail: string, spent: number, budget: number) { ... }
  ```
- `lumen-server/src/middleware/budget.ts` — after calculating spend, check if it crossed the 80% threshold this request (i.e., was below 80% before, now at or above). If so, call `sendBudgetAlert`. Add a `budget_alert_sent_at` column to users to prevent repeated alerts.
- `lumen-server/src/db/migrations/003_search.sql` (or a new 004) — `ALTER TABLE users ADD COLUMN budget_alert_sent_at INTEGER;` (reset monthly)
- `.env.example` — document `RESEND_API_KEY` and `EMAIL_FROM` variables

**Technical notes:**
- `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `noreply@yourdomain.com`) must be in env.
- The 80% threshold check: `if (spentBeforeThisRequest < 0.8 * budget && spentAfterThisRequest >= 0.8 * budget)` — only fires on the crossing event.
- Reset `budget_alert_sent_at` at the start of each month (either via a cron job or lazily in the check — if the saved date is from a prior month, treat as unset).

**Gotchas:**
- Resend is already in `package.json` — just needs an API key and `FROM` domain configured.
- Don't block the request while sending email — fire and forget (`sendBudgetAlert(...).catch(logger.error)`).

---

### Task 5 — Attachment Upload / Image Support

**Goal:** Let users attach files and images to messages. Images are sent inline in the Anthropic API call (`image` content blocks). Other files are read server-side and their text content is injected into the context.

**DB status:** `attachments` table already exists (`id`, `message_id`, `kind` (image|file|audio), `storage_key`).

**Files to create/modify:**
- `lumen-server/src/routes/attachments.ts` *(new)* — `POST /api/attachments/upload` (multipart) → save file, return `{attachmentId, kind, filename}`. No auth-level route needed for download since files are served by storage_key (a random ID with no guessable pattern).
- `lumen-server/src/routes/messages.ts` — when building the Anthropic API payload, if the message has attachments, convert them to content blocks: images → `{type: 'image', source: {type: 'base64', ...}}`, files → prepend extracted text as a `{type: 'text'}` block.
- `lumen-pwa/src/components/InputBox.tsx` — add paperclip icon button; file picker (`<input type="file" accept="image/*,.pdf,.txt,.md">`); show attachment previews (thumbnails for images, filename chips for files) above the text input; include `attachmentIds` in the message send payload.
- `lumen-pwa/src/lib/api.ts` — add `uploadAttachment(file: File)` function.

**Technical notes:**
- For images, Claude supports JPEG, PNG, GIF, WebP up to ~5MB. Resize client-side if needed (Canvas API) before upload.
- The Anthropic API has a 100-image limit per request and a per-image size limit — add server-side validation.
- Store images at `DATA_DIR/attachments/<userId>/<attachmentId>.<ext>` (same storage root as files).

**Gotchas:**
- Base64 encoding images for every API call is expensive in both tokens and memory. Consider storing the attachment once and only loading it when the message is in the current context window.
- Audio attachments (the `kind = 'audio'` in the schema) are not yet supported by Claude — skip for now.

---

### Task 6 — Scheduled Tasks

**Goal:** Let users create cron-scheduled prompts that run automatically (e.g. "every Monday at 9am, summarize my calendar"). Results are saved as new conversations.

**DB status:** `scheduled_tasks` table exists (`id`, `user_id`, `name`, `cron_expr`, `prompt`, `model`, `enabled`, `last_run_at`). `node-cron` is already installed on the server.

**Files to create/modify:**
- `lumen-server/src/services/taskRunner.ts` *(new)* — loads enabled tasks at startup, schedules them with `node-cron`. On fire: creates a new conversation, sends the prompt, streams the result to the database (no SSE client), updates `last_run_at`.
- `lumen-server/src/routes/tasks.ts` *(new)* — CRUD: `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id` (toggle enabled, update cron), `DELETE /api/tasks/:id`. `POST /api/tasks/:id/run` for manual trigger.
- `lumen-server/src/index.ts` — register routes, call `taskRunner.start()` after bootstrap.
- `lumen-pwa/src/components/SettingsView.tsx` — add "Scheduled Tasks" tab with task list, enable/disable toggle, "Run Now" button, create/edit form (name, cron expression, prompt, model).

**Technical notes:**
- Scheduled tasks need to call the Anthropic API without an SSE client — use `anthropic.messages.create` (non-streaming) and insert the result message directly via the messages repo.
- Cron expression validation: use `node-cron.validate(expr)` before saving to DB.
- Task runs should be recorded in `audit_log` so users can see run history.

**Gotchas:**
- `node-cron` schedules are in-process — they reset on server restart. At startup, reload all enabled tasks and reschedule them.
- If a task run fails (API error), log the error in `audit_log` and do NOT create a broken conversation.

---

### Task 7 — Export Conversation

**Goal:** Download a conversation as Markdown or JSON.

**Files to create/modify:**
- `lumen-server/src/routes/conversations.ts` — add `GET /api/conversations/:id/export?format=md|json`. For Markdown: render each message as `## User` / `## Assistant` with the content. For JSON: return the full conversation object with messages array.
- `lumen-pwa/src/components/ChatPane.tsx` or header area — add "Export" button (three-dot menu) that triggers a download. Use `URL.createObjectURL(blob)` + programmatic `<a>` click.

**Technical notes:**
- Markdown export: use the message `content_json` array, extracting `text` content blocks. Include timestamps and model info in a YAML front-matter block.
- JSON export should include conversation metadata (title, model, systemPrompt, createdAt) plus full messages array.
- No new packages needed.

**Gotchas:**
- `content_json` may contain tool_use/tool_result blocks in the future — handle gracefully (render as `[tool call: name]` in Markdown export).

---

### Task 8 — Vault / Semantic Search

**Goal:** Index user's files and conversation history as vector embeddings, enabling semantic search ("find conversations where I discussed X") and automatic context injection (RAG).

**DB status:** `vault_chunks` table exists (`id`, `user_id`, `file_path`, `chunk_index`, `content`, `embedding`).

**Files to create/modify:**
- `lumen-server/src/services/embeddings.ts` *(new)* — calls Anthropic or OpenAI embedding endpoint; returns `float32[]` vector. Cache results.
- `lumen-server/src/services/vault.ts` *(new)* — `indexFile(userId, filePath, content)` chunks text and upserts embeddings into `vault_chunks`. `search(userId, query, limit)` computes query embedding and does cosine similarity against stored vectors.
- `lumen-server/src/routes/vault.ts` *(new)* — `POST /api/vault/index` (index a file), `GET /api/vault/search?q=...` (semantic search), `DELETE /api/vault/:id` (remove chunk).
- `lumen-server/src/routes/messages.ts` — optionally inject top-K vault results as context before the Anthropic call (opt-in per conversation).

**Technical notes:**
- SQLite does not have a native vector index — use in-process cosine similarity over all chunks for the user (scales to ~10K chunks easily). For larger scale, consider `sqlite-vss` extension.
- Chunk size: 512 tokens, 50-token overlap. Use a simple whitespace tokenizer for chunking (exact token count not critical at this scale).
- Anthropic does not offer an embeddings API — use `text-embedding-3-small` from OpenAI or `voyage-3-large` from Voyage AI. Add `EMBEDDING_API_KEY` and `EMBEDDING_PROVIDER` env vars.

**Gotchas:**
- Embedding `float32[]` arrays must be serialized to BLOB for SQLite storage — use `Buffer.from(new Float32Array(embedding).buffer)`.
- Cosine similarity in JS over thousands of vectors is fast (< 10ms for 10K chunks) but block the event loop — run in a `worker_threads` worker if the vault grows large.
- This feature has significant complexity and external API cost — implement after the higher-priority tasks.

---

### Task 9 — Quick Wins & UI Polish

These are small, self-contained improvements worth batching:

**9a — Copy message button**
- `lumen-pwa/src/components/MessageList.tsx` — add a copy icon button on hover over assistant messages. Uses `navigator.clipboard.writeText(messageText)`. Show a brief "Copied!" tooltip.

**9b — Conversation rename inline**
- `lumen-pwa/src/components/Sidebar.tsx` — double-click on a conversation title to enter edit mode (inline `<input>`). On blur or Enter, call `PATCH /api/conversations/:id` with the new title.

**9c — Token count indicator in input box**
- `lumen-pwa/src/components/InputBox.tsx` — estimate token count of current input (rough: `text.length / 4`) and show a subtle counter. Warn (orange) above 2000 estimated tokens.

**9d — Conversation count / empty state in sidebar**
- `lumen-pwa/src/components/Sidebar.tsx` — show "No conversations yet" with an icon when the list is empty (currently just blank).

**9e — Settings: show current month's spend in billing tab**
- `lumen-pwa/src/components/SettingsView.tsx` — Billing tab currently shows budget but not live spend. Wire up `GET /api/usage/summary?month=YYYY-MM` and display a progress bar (spend / budget).

**9f — PWA install prompt**
- `lumen-pwa/src/App.tsx` — listen for `beforeinstallprompt` event and show a subtle "Install Lumen" banner for users on desktop Chrome who haven't installed it yet.

**9g — Loading skeleton for sidebar**
- `lumen-pwa/src/components/Sidebar.tsx` — show 3–4 shimmer skeleton rows while `conversations.length === 0 && !loaded`. Currently shows blank white space during initial load.

---

## Architecture Decisions to Keep in Mind

1. **SQLite is the right call here.** Don't migrate to Postgres unless concurrent write throughput becomes a bottleneck (unlikely for a self-hosted single-user or small-team app). WAL mode handles concurrent reads fine.

2. **SSE over WebSocket for chat streaming.** The current SSE approach is simpler and works through Cloudflare Tunnel without configuration. Keep it unless you need bidirectional streaming (e.g. voice).

3. **Tool use requires conversation replay.** When Claude calls a tool mid-conversation, the server must execute the tool and re-submit the conversation (with tool_result) to get the final response. The messages route will need a loop that handles tool use turns before streaming the final response to the client. Design this loop carefully — it's the most architecturally complex part of Task 2c.

4. **Don't add a dedicated vector DB.** The vault_chunks table with in-process cosine similarity is fine up to ~50,000 chunks per user. Only add `sqlite-vss` if query time exceeds 100ms in practice.

5. **Extension tokens vs. JWT.** The `extension_tokens` table stores long-lived tokens separate from session JWTs. These should survive JWT rotation. When implementing the Settings → Browser Extension token UI, generate the raw token once (show it once, store only the hash) and provide a "Regenerate" button.
