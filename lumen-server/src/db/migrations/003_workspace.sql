-- Migration 003: per-workspace conversation buckets (Chat / Cowork / Code)
ALTER TABLE conversations ADD COLUMN workspace TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS idx_conv_user_workspace
  ON conversations(user_id, workspace, last_message_at DESC) WHERE deleted_at IS NULL;
