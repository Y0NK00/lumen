import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'lumen.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);

// Recommended PRAGMAs for WAL + performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

logger.info({ path: DB_PATH }, 'sqlite connected');

// ── Apply base schema (all statements use IF NOT EXISTS ─ safe to run every startup) ──
const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// ── Incremental migrations (each is idempotent ─ caught errors mean already applied) ──
const migrations: string[] = [
  // v2: add workspace column to conversations
  `ALTER TABLE conversations ADD COLUMN workspace TEXT NOT NULL DEFAULT 'chat'`,
  // v2: index for workspace-scoped conversation lists
  `CREATE INDEX IF NOT EXISTS idx_conv_workspace ON conversations(user_id, workspace) WHERE deleted_at IS NULL`,
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // already applied, skip
  }
}

logger.info('db migrations applied');

process.on('exit', () => {
  try { db.close(); } catch { /* noop */ }
});
