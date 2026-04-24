import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
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

process.on('exit', () => {
  try { db.close(); } catch { /* noop */ }
});
