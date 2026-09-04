#!/usr/bin/env bash
#
# Nightly backup of the Home Kitchen database and uploaded recipe photos.
#
# Two separate things are backed up because they live in two separate volumes:
# a pg_dump captures the database, but recipe photos are files on the uploads
# volume and a database dump would not include them. Restoring only one leaves
# you with recipes pointing at images that no longer exist.
#
# Everything is streamed out through `docker compose exec`, so this never has to
# know the generated volume names -- those change with the project directory.
#
# Usage:  scripts/backup.sh [destination-dir]
# Cron:   0 3 * * *  cd /path/to/app && scripts/backup.sh >> backups/backup.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."

DEST="${1:-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
DB_USER="${POSTGRES_USER:-kitchen}"
DB_NAME=home_kitchen

mkdir -p "$DEST"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Fail loudly if the stack isn't up: a backup run that silently produces nothing
# is worse than no backup at all, because it looks like it worked.
if ! docker compose ps --status running --services 2>/dev/null | grep -q '^db$'; then
  log "ERROR: the db container is not running - nothing was backed up"
  exit 1
fi

DB_FILE="$DEST/db-$STAMP.sql.gz"
UP_FILE="$DEST/uploads-$STAMP.tar.gz"

log "Dumping database to $DB_FILE"
# --clean --if-exists makes the dump self-contained: restoring it drops existing
# objects first, so a restore works against a populated database, not just an
# empty one. --no-owner avoids failures when roles differ between machines.
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-}" db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner \
  | gzip > "$DB_FILE"

log "Archiving uploaded photos to $UP_FILE"
# `|| true` on the tar: an empty uploads dir makes tar exit non-zero, which
# would abort the run under `set -e` even though nothing is wrong.
docker compose exec -T server tar czf - -C /app/uploads . > "$UP_FILE" 2>/dev/null || true

# A gzip stream shorter than ~100 bytes means the dump produced nothing useful.
if [ ! -s "$DB_FILE" ] || [ "$(wc -c < "$DB_FILE")" -lt 100 ]; then
  log "ERROR: database dump is empty or truncated - removing it"
  rm -f "$DB_FILE"
  exit 1
fi

# Verify the archives are readable before trusting them and pruning old ones.
gzip -t "$DB_FILE" || { log "ERROR: $DB_FILE is corrupt"; exit 1; }
gzip -t "$UP_FILE" 2>/dev/null || log "WARNING: uploads archive unreadable or empty"

log "Sizes: db=$(du -h "$DB_FILE" | cut -f1)  uploads=$(du -h "$UP_FILE" 2>/dev/null | cut -f1)"

# Prune only after the new backup is verified, so a failed run never deletes the
# last good copy.
log "Pruning backups older than $KEEP_DAYS days"
find "$DEST" -maxdepth 1 -name 'db-*.sql.gz'      -mtime "+$KEEP_DAYS" -print -delete
find "$DEST" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -print -delete

log "Backup complete"
