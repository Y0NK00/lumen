# Lumen — Cursor Context & Build Brief

## What This Is

Lumen is a self-hosted AI assistant running on Unraid. It has a Fastify + TypeScript backend and a React + Vite PWA frontend. It talks to Anthropic's API for chat (Claude models). Everything runs in Docker and is served at `tower.local`.

**You are the implementer.** This file tells you exactly where the codebase stands and exactly what to build next. Do not restructure existing code unless instructed — just add the new pieces.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Fastify, TypeScript, better-sqlite3 (SQLite) |
| Frontend | React 18, Vite, Zustand, plain CSS vars |
| Auth | JWT (jose), bcrypt |
| AI | Anthropic SDK (streaming, SSE) |
| Deploy | Docker on Unraid, data at `/data/` in container |

---

## Directory Structure

```
lumen/                          ← repo root
├── lumen-server/               ← TypeScript backend
│   ├── src/
│   │   ├── index.ts            ← Fastify app entry, registers all routes
│   │   ├── bootstrap.ts        ← Creates admin user on first run
│   │   ├── extensionBridge.ts  ← Chrome extension bridge (ignore for now)
│   │   ├── db/
│   │   │   ├── connection.ts   ← SQLite init, schema + migrations runner
│   │   │   ├── schema.sql      ← Base schema (all IF NOT EXISTS)
│   │   │   └── repos/          ← One file per table
│   │   │       ├── artifacts.ts
│   │   │       ├── conversations.ts
│   │   │       ├── memory.ts
│   │   │       ├── messages.ts
│   │   │       ├── projects.ts
│   │   │       ├── scheduledTasks.ts
│   │   │       └── usage.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts         ← requireAuth (sets req.auth)
│   │   │   └── budget.ts       ← checkBudget (monthly spend gate)
│   │   ├── routes/             ← One file per route group
│   │   │   ├── artifacts.ts
│   │   │   ├── auth.ts
│   │   │   ├── conversations.ts
│   │   │   ├── health.ts
│   │   │   ├── memory.ts
│   │   │   ├── messages.ts     ← SSE streaming route
│   │   │   ├── oauth.ts
│   │   │   ├── projects.ts
│   │   │   ├── scheduledTasks.ts
│   │   │   ├── settings.ts
│   │   │   └── usage.ts
│   │   ├── services/
│   │   │   └── providers/
│   │   │       └── anthropic.ts ← Streaming, abort, cost calc, auto-title
│   │   └── lib/
│   │       ├── logger.ts       ← Pino logger
│   │       └── token.ts        ← JWT sign/verify
│   ├── package.json
│   └── tsconfig.json
│
├── lumen-pwa/                  ← React PWA frontend
│   └── src/
│       ├── main.tsx            ← React entry
│       ├── App.tsx             ← Auth check + router
│       ├── Layout.tsx          ← Main shell (sidebar, tabs, settings modal)
│       ├── components/
│       │   ├── ChatPane.tsx
│       │   ├── InputBox.tsx
│       │   ├── MessageList.tsx
│       │   ├── Sidebar.tsx
│       │   ├── SettingsView.tsx
│       │   └── ... others
│       ├── stores/
│       │   ├── appStore.ts     ← conversations, messages, streaming state
│       │   ├── authStore.ts    ← token, user, login/logout
│       │   ├── themeStore.ts   ← active theme, CSS vars
│       │   └── workspaceStore.ts
│       ├── hooks/
│       │   ├── useStream.ts    ← SSE listener
│       │   └── useTheme.ts
│       └── lib/
│           └── api.ts          ← All fetch calls to backend
```

---

## Database (SQLite, better-sqlite3)

All queries are **synchronous** (`db.prepare().run()`, `.get()`, `.all()`). No ORM.
IDs use nanoid: `const id = \`prefix_${nanoid(16)}\``.
Timestamps are ISO strings via `datetime('now')` in SQLite or `new Date().toISOString()` in TS.
Soft deletes: set `deleted_at`, never hard delete.

### How migrations work
`connection.ts` runs `schema.sql` on every startup (all IF NOT EXISTS — safe).
Incremental migrations are in the `migrations` array in `connection.ts` — each is a raw SQL string, wrapped in try/catch to skip if already applied.

### Existing tables
- `users` — id, email, password_hash, display_name, role, monthly_budget_usd, budget_alert_threshold, disabled, settings_json, timestamps
- `sessions` — jti, user_id, issued/expires/revoked_at, user_agent, ip_address
- `projects` — id, user_id, name, description, system_prompt, pinned, timestamps+deleted_at
- `conversations` — id, user_id, project_id, workspace (chat/cowork/code), title, model, system_prompt, timestamps+deleted_at
- `messages` — id, conversation_id, user_id, role, content_json, finish_reason, created_at
- `attachments` — id, message_id, user_id, kind, filename, mime_type, size_bytes, storage_key, created_at
- `usage_events` — id, user_id, conversation_id, message_id, model, input/output/cache tokens, cost_usd, created_at
- `oauth_tokens` — id, user_id, provider, access_token, refresh_token, scope, expires_at, timestamps
- `extension_tokens` — id, user_id, token_hash, name, last_used_at, created_at, revoked_at
- `scheduled_tasks` — id, user_id, name, cron_expr, prompt, model, enabled, last_run_at, last_status, timestamps
- `audit_log` — id (autoincrement), user_id, actor_id, event_type, details_json, ip/ua, created_at
- `vault_chunks` — id, user_id, file_path, chunk_index, content, embedding BLOB, updated_at
- `schema_version` — version, applied_at
- `memories` — id, user_id, content, source, created_at
- `artifacts` — id, user_id, title, body, kind, conversation_id, created_at, updated_at, deleted_at

**Note:** The `artifacts` table does NOT yet have `language`, `project_id`, or `version` columns. Those will be added in the migration below.

---

## Auth Pattern

Every protected route uses `{ preHandler: requireAuth }`.

`requireAuth` validates the Bearer JWT and sets `req.auth`:
```ts
req.auth = { userId: string, role: 'user' | 'admin', jti: string }
```

Always scope DB queries to `userId` from `req.auth!.userId`. Never trust IDs from the request body for ownership.

---

## Route Pattern

All routes follow this exact pattern:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

export async function xyzRoutes(app: FastifyInstance) {
  app.get('/api/xyz', { preHandler: requireAuth }, async (req, reply) => {
    const items = listXyz(req.auth!.userId);
    return reply.send({ items });
  });
}
```

Register in `index.ts`:
```ts
import { xyzRoutes } from './routes/xyz.js';
// ...
await app.register(xyzRoutes);
```

---

## What Is Already Working

| Feature | Status |
|---|---|
| Chat (SSE streaming with Anthropic) | ✅ Full |
| Conversation CRUD | ✅ Full |
| Auth (JWT, sessions, bcrypt) | ✅ Full |
| Memory (injected into system prompt) | ✅ Full |
| Projects | ✅ Full |
| Settings (theme, model, preferences) | ✅ Full |
| Usage tracking (tokens + cost) | ✅ Full |
| OAuth scaffolding (Google/GitHub) | ✅ Tokens stored, not consumed yet |
| Artifacts CRUD | ✅ Routes + DB work, frontend minimal |
| Scheduled tasks CRUD | ✅ Routes + DB, no cron daemon yet |
| Admin user CRUD | ✅ Routes only, no frontend |

---

## What To Build Now: File & Document System

### Goal
Lumen should be able to create, display, and edit files and documents — markdown, code, scripts, HTML, plain text. AI creates files mid-chat via tool use. Users can open, edit, and download them. Files persist on the server at `/data/files/`.

This will be built in 4 phases. **Start with Phase 1.**

---

## Phase 1: Backend Foundation

### 1A — DB Migration (add to `connection.ts` migrations array)

Add the `files` table and a migration to add columns to `artifacts`:

```sql
-- New files table
CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  project_id      TEXT REFERENCES projects(id),
  conversation_id TEXT REFERENCES conversations(id),
  name            TEXT NOT NULL,
  language        TEXT NOT NULL DEFAULT 'markdown',
  content         TEXT NOT NULL DEFAULT '',
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  pinned          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_conv ON files(conversation_id) WHERE deleted_at IS NULL;
```

Add these migration strings to the migrations array in `connection.ts`:
```ts
`CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  project_id      TEXT REFERENCES projects(id),
  conversation_id TEXT REFERENCES conversations(id),
  name            TEXT NOT NULL,
  language        TEXT NOT NULL DEFAULT 'markdown',
  content         TEXT NOT NULL DEFAULT '',
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  pinned          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
)`,
`CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id) WHERE deleted_at IS NULL`,
`CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id) WHERE deleted_at IS NULL`,
`CREATE INDEX IF NOT EXISTS idx_files_conv ON files(conversation_id) WHERE deleted_at IS NULL`,
```

### 1B — File Repo (`lumen-server/src/db/repos/files.ts`)

Create this file with these exact exports:

```ts
export interface LumenFile {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  name: string;
  language: string;
  content: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// List all files for user (no content — for sidebar listing)
export interface LumenFileStub {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  name: string;
  language: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listFiles(userId: string, opts?: { projectId?: string; conversationId?: string }): LumenFileStub[]
export function getFileById(id: string, userId: string): LumenFile | null
export function createFile(userId: string, input: {
  name: string;
  language?: string;
  content?: string;
  projectId?: string | null;
  conversationId?: string | null;
}): LumenFile
export function updateFile(id: string, userId: string, input: {
  name?: string;
  language?: string;
  content?: string;
  projectId?: string | null;
  pinned?: boolean;
}): LumenFile | null
export function softDeleteFile(id: string, userId: string): boolean
```

Implementation notes:
- IDs: `const id = \`f_${nanoid(16)}\``
- `sizeBytes`: calculate as `Buffer.byteLength(content, 'utf8')` on create and update
- `listFiles` returns stub (no `content` column) — use explicit SELECT columns, not `SELECT *`
- Filter by `projectId` or `conversationId` if provided in opts
- All queries scoped to `userId` and `deleted_at IS NULL`

### 1C — File Routes (`lumen-server/src/routes/files.ts`)

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { listFiles, getFileById, createFile, updateFile, softDeleteFile } from '../db/repos/files.js';
import { logger } from '../lib/logger.js';

// Allowed file languages/types
const LANGUAGES = [
  'markdown', 'plaintext', 'javascript', 'typescript', 'python',
  'bash', 'sh', 'json', 'yaml', 'toml', 'html', 'css', 'sql',
  'rust', 'go', 'java', 'csharp', 'cpp', 'c', 'xml', 'dockerfile',
] as const;

const createBody = z.object({
  name: z.string().min(1).max(500),
  language: z.enum(LANGUAGES).optional().default('markdown'),
  content: z.string().max(500_000).optional().default(''),
  projectId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).max(500).optional(),
  language: z.enum(LANGUAGES).optional(),
  content: z.string().max(500_000).optional(),
  projectId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function fileRoutes(app: FastifyInstance) {

  // List files (no content — stub only)
  app.get('/api/files', { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { project_id?: string; conversation_id?: string };
    const items = listFiles(req.auth!.userId, {
      projectId: query.project_id,
      conversationId: query.conversation_id,
    });
    return reply.send({ items });
  });

  // Get single file with full content
  app.get('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = getFileById(id, req.auth!.userId);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ file });
  });

  // Create file
  app.post('/api/files', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    const file = createFile(req.auth!.userId, parsed.data);
    logger.info({ userId: req.auth!.userId, fileId: file.id, name: file.name }, 'file.created');
    return reply.code(201).send({ file });
  });

  // Update file (content, name, language, pin)
  app.patch('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    const file = updateFile(id, req.auth!.userId, parsed.data);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ file });
  });

  // Export / download raw content
  app.get('/api/files/:id/export', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = getFileById(id, req.auth!.userId);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    // Derive a safe filename
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
    return reply.send(file.content);
  });

  // Upload a file (multipart — raw text files only for now)
  // Accepts: Content-Type: text/plain, sends raw body as content
  app.post('/api/files/upload', { preHandler: requireAuth }, async (req, reply) => {
    const name = (req.headers['x-file-name'] as string) ?? 'uploaded-file.txt';
    const language = (req.headers['x-file-language'] as string) ?? 'plaintext';
    const content = typeof req.body === 'string' ? req.body : '';
    if (content.length > 500_000) {
      return reply.code(413).send({ error: { code: 'TOO_LARGE', message: 'File exceeds 500KB limit' } });
    }
    const file = createFile(req.auth!.userId, { name, language, content });
    logger.info({ userId: req.auth!.userId, fileId: file.id }, 'file.uploaded');
    return reply.code(201).send({ file });
  });

  // Soft delete
  app.delete('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = softDeleteFile(id, req.auth!.userId);
    if (!ok) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ ok: true });
  });
}
```

### 1D — Register in `index.ts`

Add to `lumen-server/src/index.ts`:
```ts
import { fileRoutes } from './routes/files.js';
// ...in main():
await app.register(fileRoutes);
```

### 1E — TypeScript build check

After writing all files, run from `lumen-server/`:
```bash
npm run build
```
Fix any TypeScript errors before moving to Phase 2. There should be none if you follow the patterns above.

---

## Phase 2: Frontend — Files Panel & Editor

### Goal
A Files panel in the sidebar + a CodeMirror editor that opens when you click a file.

### 2A — Install CodeMirror in `lumen-pwa/`

```bash
cd lumen-pwa
npm install @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json @codemirror/lang-sql @codemirror/theme-one-dark codemirror
```

### 2B — API client additions (`lumen-pwa/src/lib/api.ts`)

Add these functions to the existing api.ts:
```ts
export async function listFiles(opts?: { project_id?: string; conversation_id?: string }): Promise<FileStub[]>
export async function getFile(id: string): Promise<LumenFile>
export async function createFile(input: { name: string; language?: string; content?: string; projectId?: string | null; conversationId?: string | null }): Promise<LumenFile>
export async function updateFile(id: string, patch: { name?: string; language?: string; content?: string; pinned?: boolean }): Promise<LumenFile>
export async function deleteFile(id: string): Promise<void>
export async function exportFile(id: string): Promise<string>  // returns raw text
export async function uploadFile(name: string, language: string, content: string): Promise<LumenFile>
```

Types (add to api.ts or a types file):
```ts
export interface FileStub {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  name: string;
  language: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LumenFile extends FileStub {
  content: string;
}
```

### 2C — Files Store (`lumen-pwa/src/stores/filesStore.ts`)

New Zustand store:
```ts
import { create } from 'zustand';
import { FileStub, LumenFile } from '../lib/api';

interface FilesState {
  files: FileStub[];
  openFile: LumenFile | null;
  editorDirty: boolean;  // true = unsaved changes
  setFiles: (files: FileStub[]) => void;
  setOpenFile: (file: LumenFile | null) => void;
  setEditorDirty: (dirty: boolean) => void;
  updateStub: (file: FileStub) => void;
  removeFile: (id: string) => void;
}
```

### 2D — Components to create

**`lumen-pwa/src/components/FilesPanel.tsx`**
- Lists files from filesStore
- Pinned files at top, then by updatedAt DESC
- Each row: file icon (based on language), name, updated date
- Click → load full file via `getFile(id)`, set as `openFile`
- "New File" button → opens a modal or inline form for name + language
- Upload button → file input, reads as text, calls `uploadFile`
- Renders inside the sidebar (same container as conversation list)

**`lumen-pwa/src/components/FileEditor.tsx`**
- Takes `file: LumenFile` as prop
- CodeMirror 6 editor — language extension selected from `file.language`
- Top bar: filename (editable inline), language selector, Save button, Download button, Close button
- Save button calls `updateFile(file.id, { content })` → clears dirty flag
- Download button calls `exportFile(file.id)` → triggers browser download
- Auto-save debounce: 2 seconds after last keystroke, call `updateFile`
- Show "Unsaved changes" indicator when dirty
- Opens as a panel replacing the chat area (or as a drawer over it)

**Language → CodeMirror extension map:**
```ts
const langExtension = {
  markdown: markdown(),
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
  python: python(),
  html: html(),
  css: css(),
  json: json(),
  sql: sql(),
  // plaintext, bash, sh, yaml, etc. → no language extension (raw text is fine)
}
```

### 2E — Wire into Layout

In `Layout.tsx`:
- Add a "Files" tab or icon to the sidebar navigation alongside the existing nav
- When Files is active: render `<FilesPanel />` in sidebar
- When `openFile` is set in filesStore: render `<FileEditor file={openFile} />` in the main content area
- When no file is open: render the normal `<ChatPane />`

---

## Phase 3: AI Tool Use (Create & Edit Files from Chat)

### Goal
When user asks "write me a bash script for X", Lumen creates the file automatically and shows a card in the chat.

### 3A — Tool definitions (add to `lumen-server/src/services/providers/anthropic.ts`)

Add these two tool definitions to send alongside every message:

```ts
const tools = [
  {
    name: 'create_file',
    description: 'Create a new file with the given name, language, and content. Use this when the user asks you to write, create, or generate a file, script, or document.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Filename including extension (e.g. backup.sh, notes.md)' },
        language: {
          type: 'string',
          enum: ['markdown', 'plaintext', 'javascript', 'typescript', 'python', 'bash', 'sh', 'json', 'yaml', 'html', 'css', 'sql'],
          description: 'Programming language or file type',
        },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['name', 'language', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace the full content of an existing file. Use this when the user asks you to modify, fix, or update an existing file.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: 'The ID of the file to edit (starts with f_)' },
        content: { type: 'string', description: 'The complete new content for the file' },
      },
      required: ['file_id', 'content'],
    },
  },
];
```

Pass these to the Anthropic API call alongside `messages` and `system`.

### 3B — Handle tool_use events in the message route

In `lumen-server/src/routes/messages.ts`:

When the stream emits a `tool_use` event from Anthropic:
1. Extract `tool_name` and `tool_input`
2. For `create_file`: call `createFile(userId, { name, language, content, conversationId })`
3. For `edit_file`: call `updateFile(fileId, userId, { content })`
4. Emit a new SSE event: `file_event` with payload `{ type: 'created' | 'updated', file: LumenFileStub }`
5. Continue the stream normally

### 3C — Frontend handles `file_event`

In `useStream.ts` (or wherever SSE events are parsed):
- Listen for `event: file_event`
- On receive: add/update the file in filesStore
- Render a `<FileCard />` component in the message list where the tool use happened

**`FileCard` component** (inline in message):
```tsx
// Shows: 📄 filename.sh · bash · 1.2 KB  [Open] [Download]
// "Open" → sets openFile in filesStore
// "Download" → calls exportFile(id)
```

---

## Phase 4: Polish

- Markdown preview toggle in FileEditor (split pane: edit | rendered)
- File search (filter by name in FilesPanel)
- Group by project in FilesPanel
- Pin/unpin in file row context menu
- Show file count badge in sidebar Files tab

---

## Conventions to Follow

**Naming:**
- Backend repos: camelCase functions, snake_case DB columns
- Routes: kebab-case URLs (`/api/files/:id/export`)
- Frontend: PascalCase components, camelCase everything else

**Error responses (backend):**
```ts
reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } })
reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } })
```

**No hard deletes.** Always use `deleted_at`.

**Imports use `.js` extension** in TypeScript source (ESM): `import { db } from '../connection.js'`

**All DB queries scoped to `userId`.** Never trust IDs from request body for ownership checks.

---

## After Phase 1 is Done

Paste the diff or the completed files back to Claude for review before moving to Phase 2. The review will check: TypeScript correctness, DB query safety, auth scoping, and route consistency with the existing codebase.

Start with Phase 1. Build `connection.ts` migrations → `repos/files.ts` → `routes/files.ts` → register in `index.ts` → `npm run build`.
