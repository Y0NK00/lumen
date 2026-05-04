-- Migration 004: user artifacts (notes, exports, cowork outputs)
CREATE TABLE IF NOT EXISTS artifacts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '',
  kind             TEXT NOT NULL DEFAULT 'note',
  conversation_id  TEXT REFERENCES conversations(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts(user_id) WHERE deleted_at IS NULL;
