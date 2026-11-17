#!/bin/bash
# Nightly Simmer backup, run by ~/Library/LaunchAgents/com.simmer.backup.plist.
#
# Lives outside ~/Documents on purpose: macOS privacy protection blocks
# launchd jobs from reading Documents, so a script there fails with
# "Operation not permitted". This talks to the containers by name instead of
# through docker compose, so it never needs the repo folder. The container
# names are stable because docker-compose.yml pins the project name.
# Installed copy: ~/.simmer/backup.sh (see SELF-HOSTING.md). Manual equivalent: scripts/backup.sh
set -euo pipefail

DEST="$HOME/SimmerBackups"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"
DB=homekitchensite-db-1
SERVER=homekitchensite-server-1
mkdir -p "$DEST"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ "$(docker inspect -f '{{.State.Running}}' "$DB" 2>/dev/null)" != "true" ]; then
  log "ERROR: $DB is not running - nothing was backed up"
  exit 1
fi

DB_FILE="$DEST/db-$STAMP.sql.gz"
UP_FILE="$DEST/uploads-$STAMP.tar.gz"

# Inside the postgres container local socket connections are trusted, so no
# password is needed. The user comes from the container's own environment.
docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  | gzip > "$DB_FILE"
docker exec "$SERVER" tar czf - -C /app/uploads . > "$UP_FILE" 2>/dev/null || true

if [ "$(wc -c < "$DB_FILE")" -lt 100 ] || ! gzip -t "$DB_FILE"; then
  log "ERROR: dump is empty or corrupt - removing it, keeping older backups"
  rm -f "$DB_FILE"
  exit 1
fi

log "OK db=$(du -h "$DB_FILE" | cut -f1) uploads=$(du -h "$UP_FILE" | cut -f1)"
find "$DEST" -maxdepth 1 -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
