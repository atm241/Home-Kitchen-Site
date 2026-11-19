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

# Optional dead-man's switch: put BACKUP_PING_URL=https://hc-ping.com/... in
# ~/.simmer/backup.env. Success pings the URL, failure pings URL/fail.
[ -f "$HOME/.simmer/backup.env" ] && . "$HOME/.simmer/backup.env"
ping_monitor() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL%/}$1" > /dev/null 2>&1 || log "WARNING: could not reach BACKUP_PING_URL"
}
on_exit() {
  local rc=$?
  if [ "$rc" -eq 0 ]; then ping_monitor ""; else ping_monitor /fail; fi
}
trap on_exit EXIT

# Pull mode: once the app runs on another machine, set in backup.env
#   SIMMER_SERVER=user@server-name        (any address ssh can reach, e.g. Tailscale)
#   SIMMER_SERVER_BACKUPS=simmer/backups  (optional; relative to the remote home)
# and this copies the server's newest backup pair here instead, so a copy
# always exists off the server. ssh must log in without a prompt (see
# SELF-HOSTING.md for the key setup).
if [ -n "${SIMMER_SERVER:-}" ]; then
  REMOTE_DIR="${SIMMER_SERVER_BACKUPS:-simmer/backups}"
  SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20)
  # The server's backup runs at 3 AM; a dump finished more than 36 hours ago
  # means its nightly job has stopped, which should alert rather than pass.
  LATEST="$(ssh "${SSH_OPTS[@]}" "$SIMMER_SERVER" \
    "find $REMOTE_DIR -maxdepth 1 -name 'db-*.sql.gz' -mmin -2160 | sort | tail -1")"
  if [ -z "$LATEST" ]; then
    log "ERROR: no backup newer than 36 hours on $SIMMER_SERVER:$REMOTE_DIR"
    exit 1
  fi
  NAME="$(basename "$LATEST")"
  STAMP_REMOTE="${NAME#db-}"; STAMP_REMOTE="${STAMP_REMOTE%.sql.gz}"
  if [ -f "$DEST/$NAME" ]; then
    log "OK already have $NAME"
  else
    scp -q "${SSH_OPTS[@]}" "$SIMMER_SERVER:$LATEST" "$DEST/$NAME.part"
    gzip -t "$DEST/$NAME.part" || { rm -f "$DEST/$NAME.part"; log "ERROR: $NAME arrived corrupt"; exit 1; }
    mv "$DEST/$NAME.part" "$DEST/$NAME"
    scp -q "${SSH_OPTS[@]}" "$SIMMER_SERVER:$REMOTE_DIR/uploads-$STAMP_REMOTE.tar.gz" "$DEST/" \
      || log "WARNING: no uploads archive for $STAMP_REMOTE"
    log "OK pulled $NAME from $SIMMER_SERVER ($(du -h "$DEST/$NAME" | cut -f1))"
  fi
  # Server copies are kept longer: this is the off-machine safety net.
  find "$DEST" -maxdepth 1 -name 'db-*.sql.gz' -mtime +30 -delete
  find "$DEST" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime +30 -delete
  exit 0
fi

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
