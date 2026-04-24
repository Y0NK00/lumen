# Lumen API Contract

**Version:** v1
**Base URL (dev):** `http://localhost:7747`
**Base URL (prod):** `https://lumen.{yourdomain}` (via Cloudflare Tunnel)

All requests except `/api/auth/*` require `Authorization: Bearer <jwt>` header.

All responses are JSON unless noted (SSE streams, file downloads).

Error responses follow RFC 7807:
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid or expired token" } }
```

---

## Auth

### POST `/api/auth/login`
Login with email + password. Returns JWT.

**Request:**
```json
{ "email": "will@example.com", "password": "..." }
```

**Response 200:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "u_abc123",
    "email": "will@example.com",
    "displayName": "Will",
    "role": "admin",
    "createdAt": "2026-04-23T..."
  }
}
```

**Response 401:** invalid credentials. Rate-limited to 5 attempts / 15 min per IP.

### POST `/api/auth/refresh`
Refresh token near expiry. Request: `{ "token": "..." }` → new token.

### POST `/api/auth/logout`
Invalidates the token server-side (stored in revocations table).

### GET `/api/auth/me`
Returns current user info. Cheap, for client to verify token on boot.

---

## Conversations

### GET `/api/conversations`
List all conversations for current user.

**Query params:**
- `limit` (default 50, max 200)
- `cursor` (for pagination)
- `search` (full-text over titles + message content)
- `project_id` (filter to a project/Helm)

**Response:**
```json
{
  "items": [
    {
      "id": "c_abc",
      "title": "Migrating Lumen to Unraid",
      "projectId": null,
      "messageCount": 42,
      "lastMessageAt": "2026-04-23T...",
      "createdAt": "2026-04-22T...",
      "totalCostUsd": 0.42
    }
  ],
  "nextCursor": "..."
}
```

### POST `/api/conversations`
Create new conversation.

**Request:**
```json
{ "title": "New chat", "projectId": null, "model": "claude-sonnet-4-6" }
```

### GET `/api/conversations/:id`
Full conversation including all messages.

### PATCH `/api/conversations/:id`
Update title, project, model, system prompt.

### DELETE `/api/conversations/:id`
Soft delete (sets deleted_at). Admin can hard-delete.

---

## Messages + Streaming

### POST `/api/conversations/:id/messages` (SSE stream)

Send a user message and stream the assistant's response.

**Request:**
```json
{
  "content": "What's in my notes about OAuth?",
  "attachments": [{ "type": "image", "data": "base64..." }],
  "model": "claude-sonnet-4-6"
}
```

**Pre-flight checks (before first SSE event):**
- Auth valid
- User not over monthly budget → 402 Payment Required if over
- Conversation belongs to user → 404 if not

**Response:** `Content-Type: text/event-stream`

Events:
```
event: message_created
data: { "messageId": "m_user_abc", "role": "user" }

event: assistant_start
data: { "messageId": "m_ast_xyz" }

event: text_delta
data: { "delta": "Based on your " }

event: text_delta
data: { "delta": "notes..." }

event: tool_use_start
data: { "toolId": "t_1", "name": "vault_search", "input": {...} }

event: tool_use_result
data: { "toolId": "t_1", "output": "..." }

event: usage
data: { "inputTokens": 1234, "outputTokens": 567, "cacheReadTokens": 0, "cacheWriteTokens": 0, "costUsd": 0.0132 }

event: done
data: { "messageId": "m_ast_xyz", "finishReason": "end_turn" }

event: error
data: { "code": "BUDGET_EXCEEDED", "message": "Monthly budget exceeded" }
```

### POST `/api/conversations/:id/abort`
Abort the in-flight stream for this conversation.

---

## Settings (per-user)

### GET `/api/settings`
Current user's settings blob.

**Response:**
```json
{
  "defaultClaudeModel": "claude-sonnet-4-6",
  "systemPrompt": "...",
  "vaultPath": "/vault/will",
  "theme": "dark",
  "ollamaEmbedModel": "nomic-embed-text",
  "notifyOnBudgetThreshold": true
}
```

### PATCH `/api/settings`
Partial update. Merges into existing settings row.

---

## Usage + Budget

### GET `/api/usage/summary`
Current month spend + breakdown.

**Response:**
```json
{
  "monthStart": "2026-04-01T00:00:00Z",
  "totalCostUsd": 12.47,
  "totalInputTokens": 1203500,
  "totalOutputTokens": 89432,
  "budgetUsd": 50.00,
  "budgetUtilization": 0.249,
  "byModel": {
    "claude-sonnet-4-6": { "costUsd": 10.21, "messages": 87 },
    "claude-opus-4-6": { "costUsd": 2.26, "messages": 4 }
  },
  "byDay": [
    { "date": "2026-04-23", "costUsd": 1.12 }
  ]
}
```

### GET `/api/usage/events?limit=100&cursor=...`
Paginated raw usage events.

---

## Vault (per-user file operations)

All paths are relative to the user's configured vault root. Server enforces this.

### GET `/api/vault/list?path=...`
### GET `/api/vault/read?path=...`
### PUT `/api/vault/write` — body `{ path, content }`
### POST `/api/vault/search` — body `{ query, path? }` (keyword)
### POST `/api/vault/semantic-search` — body `{ query, topK }` (uses Ollama embeddings)
### POST `/api/vault/index/build` — rebuilds semantic index for user's vault
### GET `/api/vault/index/meta`
### DELETE `/api/vault/index`

---

## Scheduled Tasks (cron)

### GET `/api/tasks`
List user's scheduled tasks.

### POST `/api/tasks`
Create task. Body: `{ name, cron, prompt, model? }`

### PATCH `/api/tasks/:id`
### DELETE `/api/tasks/:id`
### POST `/api/tasks/:id/run-now`

---

## Admin (role = "admin" only)

### GET `/api/admin/users`
List all users with usage summary.

### POST `/api/admin/users`
Create user. Body: `{ email, password, displayName, role, monthlyBudgetUsd }`.
Triggers welcome email via Resend.

### PATCH `/api/admin/users/:id`
Update user (role, budget, disabled).

### DELETE `/api/admin/users/:id`
Soft delete user (data retained for audit).

### GET `/api/admin/usage`
Household-wide usage breakdown across all users.

### GET `/api/admin/audit-log`
Recent auth events, admin actions, budget triggers.

---

## WebSocket `/ws`

Real-time events for the logged-in user. Auth via `?token=...` query param or `Authorization` header on upgrade.

**Server → Client events:**
```json
{ "type": "conversation.updated", "data": { "id": "c_abc", "title": "..." } }
{ "type": "message.created", "data": {...} }
{ "type": "budget.threshold", "data": { "utilization": 0.85 } }
{ "type": "extension.connected" }    // browser extension came online
{ "type": "extension.disconnected" }
```

**Client → Server:**
```json
{ "type": "ping" }
```

---

## Browser Extension WebSocket `/ws/extension`

Separate endpoint for the Chrome extension. Auth via extension-specific token (long-lived, generated in user settings UI).

On connect, server binds this WS to user_id. Commands from Claude's tool calls that need the browser get routed here.

**Server → Extension:**
```json
{ "type": "browse", "cmdId": "...", "action": "navigate", "url": "..." }
{ "type": "browse", "cmdId": "...", "action": "screenshot" }
{ "type": "browse", "cmdId": "...", "action": "get_content" }
```

**Extension → Server:**
```json
{ "type": "browse_result", "cmdId": "...", "ok": true, "data": {...} }
{ "type": "status", "connected": true }
```

---

## Health

### GET `/api/health`
Public. Returns `{ "ok": true, "version": "0.1.0", "uptime": 12345 }`. Used by Unraid container healthcheck and external monitoring.

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5 / 15min per IP |
| `POST /api/conversations/:id/messages` | 60 / min per user |
| All other authenticated | 600 / min per user |

Exceeding returns 429 with `Retry-After` header.
