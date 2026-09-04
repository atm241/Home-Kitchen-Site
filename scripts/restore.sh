#!/usr/bin/env bash
#
# Restore the Home Kitchen database and uploaded photos from a backup pair.
#
# Usage:
#   scripts/restore.sh backups/db-20260904-030000.sql.gz
#
# The matching uploads archive is found automatically by timestamp; pass it as a
# second argument to override, or "none" to restore the database only.
#
# THIS REPLACES CURRENT DATA. It requires typing the confirmation phrase, since
# the whole point of the backups is that data loss is the thing we're afraid of.

set -euo pipefail

cd "$(dirname "$0")/.."

DB_FILE="${1:-}"
UP_FILE="${2:-}"

if [ -z "$DB_FILE" ]; then
  echo "Usage: scripts/restore.sh <db-backup.sql.gz> [uploads-backup.tar.gz|none]"
  echo
  echo "Available backups:"
  ls -1t backups/db-*.sql.gz 2>/dev/null | head -10 | sed 's/^/  /' || echo "  (none found)"
  exit 1
fi
[ -f "$DB_FILE" ] || { echo "ERROR: $DB_FILE not found"; exit 1; }

# Derive the matching uploads archive from the db filename's timestamp.
if [ -z "$UP_FILE" ]; then
  STAMP="$(basename "$DB_FILE" | sed 's/^db-//; s/\.sql\.gz$//')"
  # Look beside the database dump, not in a hardcoded backups/ -- otherwise
  # restoring from an external drive or any custom path silently finds no
  # uploads archive and quietly drops every photo.
  UP_FILE="$(dirname "$DB_FILE")/uploads-$STAMP.tar.gz"
  [ -f "$UP_FILE" ] || { echo "NOTE: no uploads archive for $STAMP; restoring database only"; UP_FILE=none; }
fi

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
DB_USER="${POSTGRES_USER:-kitchen}"
DB_NAME=home_kitchen

if ! docker compose ps --status running --services 2>/dev/null | grep -q '^db$'; then
  echo "ERROR: the db container is not running. Start it with: docker compose up -d"
  exit 1
fi

echo "About to restore:"
echo "  database: $DB_FILE"
echo "  uploads : $UP_FILE"
echo
echo "This REPLACES the current database and photos. This cannot be undone."
printf 'Type "restore" to continue: '
read -r CONFIRM
[ "$CONFIRM" = "restore" ] || { echo "Aborted."; exit 1; }

gzip -t "$DB_FILE" || { echo "ERROR: $DB_FILE is corrupt - not restoring"; exit 1; }

echo "Restoring database..."
# ON_ERROR_STOP so a broken restore fails loudly instead of leaving the database
# half-populated and appearing to have succeeded.
# stdout goes to /dev/null: a dump is full of setval/CREATE chatter that buries
# any real error. stderr still surfaces, and ON_ERROR_STOP makes failures fatal.
gunzip -c "$DB_FILE" | docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-}" db \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -q > /dev/null

if [ "$UP_FILE" != none ]; then
  echo "Restoring uploaded photos..."
  gzip -t "$UP_FILE" || { echo "ERROR: $UP_FILE is corrupt - database was restored, photos were not"; exit 1; }
  docker compose exec -T server sh -c 'rm -rf /app/uploads/* || true'
  docker compose exec -T server tar xzf - -C /app/uploads < "$UP_FILE"
fi

echo
echo "Restore complete. Verify with:"
echo "  docker compose exec -T db psql -U $DB_USER -d $DB_NAME -c 'SELECT count(*) FROM recipes;'"
