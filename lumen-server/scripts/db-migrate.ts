/**
 * Apply pending versioned migrations from src/db/migrations/.
 * Each migration file is named `NNN_description.sql` where NNN is an integer.
 * Tracked in the schema_version table.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db/connection.js';
import { logger } from '../src/lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

if (!fs.existsSync(MIGRATIONS_DIR)) {
  logger.info('no migrations directory, nothing to do');
  process.exit(0);
}

const currentRow = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
const currentVersion = currentRow.v ?? 0;

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

let applied = 0;
for (const file of files) {
  const version = Number(file.split('_')[0]);
  if (version <= currentVersion) continue;

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const tx = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
  });
  tx();
  logger.info({ version, file }, 'migration applied');
  applied++;
}

logger.info({ applied, currentVersion }, 'db-migrate complete');
