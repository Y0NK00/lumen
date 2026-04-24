#!/bin/sh
set -e

# Ensure data dir structure exists
mkdir -p /data/attachments /data/vaults /data/backups

# Run DB init if no DB file exists yet (idempotent inside db-init)
if [ ! -f /data/lumen.db ]; then
  echo "[entrypoint] First boot: initializing database..."
  node dist/scripts/db-init.js
fi

# Run pending migrations every boot (idempotent)
echo "[entrypoint] Running migrations..."
node dist/scripts/db-migrate.js

# Hand off to main process
exec "$@"
