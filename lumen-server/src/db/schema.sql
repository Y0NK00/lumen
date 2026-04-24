-- Lumen Server SQLite Schema v1
-- Apply with: sqlite3 data/lumen.db < src/db/schema.sql
--
-- Design notes:
-- - All tables have user_id FK where user-owned; enforced in app layer via WHERE clauses
-- - Soft delete via deleted_at IS NULL filters (preserves audit trail)
-- - Timestamps stored as ISO 8601 TEXT in UTC (SQLite has no native datetime)
-- - IDs are nanoid strings (21 chars) prefixed by type: u_, c_, m_, etc.
-- - JSON blobs stored as TEXT (SQLite JSON1 extension for querying if needed)

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ── Users ──
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,          -- u_xxx
  email                   TEXT NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,             -- bcrypt
  display_name            TEXT NOT NULL,
  role                    TEXT NOT NULL DEFAULT 'user'  -- 'user' | 'admin'
                            CHECK (role IN ('user', 'admin')),
  monthly_budget_usd      REAL NOT NULL DEFAULT 25.00,
  budget_alert_threshold  REAL NOT NULL DEFAULT 0.80, -- notify at 80%
  disabled                INTEGER NOT NULL DEFAULT 0,  -- 0|1
  settings_json           TEXT NOT NULL DEFAULT '{}', -- per-user settings blob
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at              TEXT
);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ── Sessions (JWT jti tracking for revocation) ──
CREATE TABLE IF NOT EXISTS sessions (
  jti          TEXT PRIMARY KEY,          -- JWT ID claim
  user_id      TEXT NOT NULL REFERENCES users(id),
  issued_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  user_agent   TEXT,
  ip_address   TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ── Projects (Helms) ──
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,          -- p_xxx
  user_id        TEXT NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT,
  pinned         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);
CREATE INDEX idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL;

-- ── Conversations ──
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,        -- c_xxx
  user_id         TEXT NOT NULL REFERENCES users(id),
  project_id      TEXT REFERENCES projects(id),
  title           TEXT NOT NULL DEFAULT 'New chat',
  model           TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  system_prompt   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT,
  deleted_at      TEXT
);
CREATE INDEX idx_conv_user ON conversations(user_id, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conv_project ON conversations(project_id) WHERE deleted_at IS NULL;

-- ── Messages ──
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,       -- m_xxx
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id),  -- denormalized for fast user-scoped queries
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content_json     TEXT NOT NULL,          -- content blocks (text, tool_use, tool_result, image)
  finish_reason    TEXT,                   -- 'end_turn', 'tool_use', 'max_tokens', 'stop_sequence', 'error'
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_msg_user ON messages(user_id, created_at DESC);

-- ── Attachments (images, files pinned to a message) ──
CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,            -- a_xxx
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('image', 'file', 'audio')),
  filename     TEXT,
  mime_type    TEXT,
  size_bytes   INTEGER,
  storage_key  TEXT NOT NULL,               -- filesystem path under /data/attachments/{user_id}/
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_att_msg ON attachments(message_id);

-- ── Usage Events (per-message token + cost tracking) ──
CREATE TABLE IF NOT EXISTS usage_events (
  id                  TEXT PRIMARY KEY,     -- e_xxx
  user_id             TEXT NOT NULL REFERENCES users(id),
  conversation_id     TEXT REFERENCES conversations(id),
  message_id          TEXT REFERENCES messages(id),
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd            REAL NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_user_time ON usage_events(user_id, created_at DESC);
CREATE INDEX idx_usage_user_month ON usage_events(user_id, substr(created_at, 1, 7));

-- ── OAuth Tokens (per-user third-party credentials, e.g., Google) ──
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  provider       TEXT NOT NULL,             -- 'google'
  access_token   TEXT NOT NULL,             -- encrypted at rest (see lib/crypto.ts)
  refresh_token  TEXT,
  scope          TEXT,
  expires_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, provider)
);

-- ── Extension Tokens (long-lived tokens for browser extension auth) ──
CREATE TABLE IF NOT EXISTS extension_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,         -- sha256 of the actual token
  name        TEXT NOT NULL,                -- user-friendly label, e.g., "Work Chrome"
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at  TEXT
);
CREATE INDEX idx_ext_user ON extension_tokens(user_id) WHERE revoked_at IS NULL;

-- ── Scheduled Tasks ──
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  cron_expr    TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  model        TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_run_at  TEXT,
  last_status  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_user ON scheduled_tasks(user_id);

-- ── Audit Log (admin actions, auth events, budget triggers) ──
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id),   -- nullable for anonymous events
  actor_id    TEXT REFERENCES users(id),   -- who did it (null = system)
  event_type  TEXT NOT NULL,               -- 'auth.login', 'auth.login_failed', 'user.created', 'budget.exceeded', etc.
  details_json TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_time ON audit_log(created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_type ON audit_log(event_type, created_at DESC);

-- ── Vault Index (per-user semantic search embeddings) ──
CREATE TABLE IF NOT EXISTS vault_chunks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  file_path   TEXT NOT NULL,               -- relative to user's vault root
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   BLOB NOT NULL,                -- Float32Array serialized
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vault_user_file ON vault_chunks(user_id, file_path);

-- ── Schema Version (for migrations) ──
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
