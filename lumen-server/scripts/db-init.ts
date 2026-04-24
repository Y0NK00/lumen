/**
 * Apply schema.sql to a fresh SQLite database.
 * Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db/connection.js';
import { logger } from '../src/lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

db.exec(sql);
logger.info({ schemaPath }, 'db-init: schema applied');
