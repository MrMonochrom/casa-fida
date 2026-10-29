#!/bin/bash
# Backs up Casa Fida's database to file storage every night and keeps 30 days of backups, and puts
# one back when it's needed. It's the backup service in docker-compose.yml:
#
#   docker compose run --rm backup now              a backup straight away
#   docker compose run --rm backup list             the backups there are, oldest first
#   docker compose run --rm backup check [name]     loads a backup (the newest by default) into a
#                                                   scratch database and compares it with the real one
#   docker compose run --rm backup restore <name>   replaces the database with a backup ("latest" for
#                                                   the newest). Stop the app first.
#
# Without a command it runs every day at BACKUP_TIME (UTC, 03:00 by default), and straight away if
# the newest backup is more than a day old. Backups go to the bucket in BACKUP_BUCKET, or S3_BUCKET,
# under backups/; without a bucket, to the backups volume on this server, which goes if it does.
# Photos aren't in them: they're in the bucket already.
set -euo pipefail

DB_NAME="${DB_NAME:-casa_fida}"
TIME="${BACKUP_TIME:-03:00}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
# Backups are named after the database and when they were made: casa_fida-2026-10-24T030000Z.sql.gz
NAME_FORMAT="^${DB_NAME}-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.sql\.gz$"

die() {
  echo "$*" >&2
  exit 1
}

[[ "$TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BACKUP_TIME should be a time like 03:00, not $TIME."
[[ "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP_DAYS should be a number of days, not $KEEP_DAYS."
[ -n "${DB_ROOT_PASSWORD:-}" ] || die "DB_ROOT_PASSWORD isn't set."

# MySQL's password goes in an option file, so it isn't on the command line for others to see.
umask 077
escaped="${DB_ROOT_PASSWORD//\\/\\\\}"
escaped="${escaped//\"/\\\"}"
cat > "$HOME/.my.cnf" <<EOF
[client]
host=${DB_HOST:-db}
user=root
password="$escaped"
default-character-set=utf8mb4
EOF

# rclone does the copying, to a bucket (set up from the same settings as the app's) or a folder.
# Its settings are all below, so its own settings file is empty.
mkdir -p "$HOME/.config/rclone"
touch "$HOME/.config/rclone/rclone.conf"
if [ -n "${S3_BUCKET:-}" ]; then
  case "${S3_ENDPOINT:-}" in
    *.r2.cloudflarestorage.com*) provider=Cloudflare ;;
    *.digitaloceanspaces.com*) provider=DigitalOcean ;;
    *) provider=Other ;;
  esac
  export RCLONE_CONFIG_STORE_TYPE=s3
  export RCLONE_CONFIG_STORE_PROVIDER="$provider"
  export RCLONE_CONFIG_STORE_ENDPOINT="${S3_ENDPOINT:?Set S3_ENDPOINT too}"
  export RCLONE_CONFIG_STORE_REGION="${S3_REGION:-auto}"
  export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:?Set S3_ACCESS_KEY_ID too}"
  export RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:?Set S3_SECRET_ACCESS_KEY too}"
  export RCLONE_CONFIG_STORE_FORCE_PATH_STYLE=true
  # The bucket is already there, and the access key may not be allowed to make one.
  export RCLONE_CONFIG_STORE_NO_CHECK_BUCKET=true
  BUCKET="${BACKUP_BUCKET:-$S3_BUCKET}"
  TARGET="store:$BUCKET/backups"
  WHERE="the bucket $BUCKET (in backups/)"
else
  TARGET=/backups
  WHERE="the backups volume on this server (set S3_BUCKET to keep them off it)"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The backups, oldest first: their names sort by when they were made. Other files are left alone.
backups() {
  { rclone lsf "$TARGET" --files-only 2>/dev/null || true; } | { grep -E "$NAME_FORMAT" || true; } | sort
}

newest() {
  backups | tail -n 1
}

# When a backup was made, in seconds since 1970, from its name.
made_at() {
  local stamp="${1#"$DB_NAME"-}"
  stamp="${stamp%.sql.gz}"
  date -u -d "${stamp:0:10} ${stamp:11:2}:${stamp:13:2}:${stamp:15:2}" +%s
}

size_of() {
  numfmt --to=iec --suffix=B "$(stat -c %s "$1")"
}

# Downloads a backup into $WORK and checks it's a whole gzip file. Prints where it is.
fetch() {
  local name="$1"
  [[ "$name" =~ $NAME_FORMAT ]] || die "Not the name of a backup: $name"
  rclone copyto "$TARGET/$name" "$WORK/$name" || die "Couldn't get $name from $WHERE."
  gzip -t "$WORK/$name" || die "$name is damaged: it isn't a whole gzip file."
  echo "$WORK/$name"
}

tables_of() {
  mysql -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema = '$1' AND table_type = 'BASE TABLE' ORDER BY 1"
}

rows_in() {
  mysql -N -e "SELECT COUNT(*) FROM \`$1\`.\`$2\`"
}

backup_now() {
  local name file
  name="$DB_NAME-$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
  file="$WORK/$name"
  echo "Backing up $DB_NAME to $WHERE..."
  # One consistent snapshot, without stopping the app.
  mysqldump --single-transaction --quick --no-tablespaces --routines --triggers --events \
    --hex-blob --set-gtid-purged=OFF "$DB_NAME" | gzip > "$file"
  gzip -t "$file"
  rclone copyto "$file" "$TARGET/$name"
  echo "Saved $name ($(size_of "$file"))."

  # Only once there's a new one: backups older than KEEP_DAYS go.
  local cutoff old
  cutoff=$(date -u -d "-$KEEP_DAYS days" +%s)
  for old in $(backups); do
    if [ "$old" != "$name" ] && [ "$(made_at "$old")" -lt "$cutoff" ]; then
      rclone deletefile "$TARGET/$old"
      echo "Removed $old (more than $KEEP_DAYS days old)."
    fi
  done

  # Tells a monitor (like Sentry's cron monitors, or Healthchecks.io) that the backup happened, so
  # it can email when one doesn't.
  if [ -n "${BACKUP_PING_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_PING_URL" || echo "Couldn't ping BACKUP_PING_URL." >&2
  fi
}

schedule() {
  echo "Backing up $DB_NAME every day at $TIME UTC to $WHERE, keeping $KEEP_DAYS days."
  until mysql -e 'SELECT 1' >/dev/null 2>&1; do sleep 2; done
  local last
  last=$(newest)
  if [ -z "$last" ] || [ "$(made_at "$last")" -lt "$(date -u -d '-1 day' +%s)" ]; then
    "$0" now || echo "The backup failed. Trying again at $TIME UTC." >&2
  fi
  while true; do
    local now next
    now=$(date -u +%s)
    next=$(date -u -d "today $TIME" +%s)
    [ "$next" -gt "$now" ] || next=$(date -u -d "tomorrow $TIME" +%s)
    sleep $((next - now))
    # Each backup on its own, so one that fails stops there and the next still happens.
    "$0" now || echo "The backup failed. Trying again tomorrow at $TIME UTC." >&2
  done
}

list() {
  local name found=false
  for name in $(backups); do
    found=true
    echo "$name"
  done
  $found || echo "No backups in $WHERE yet."
}

# Loads a backup into a scratch database, to show it can be restored, and compares it with the
# real database (which has changed a little since, unless it was just made).
check() {
  local name="${1:-$(newest)}"
  [ -n "$name" ] || die "No backups in $WHERE yet. Make one with: docker compose run --rm backup now"
  local file scratch="${DB_NAME}_restore_check"
  file=$(fetch "$name")
  echo "Loading $name ($(size_of "$file")) into a scratch database, $scratch..."
  mysql -e "DROP DATABASE IF EXISTS \`$scratch\`; CREATE DATABASE \`$scratch\`"
  gunzip -c "$file" | mysql "$scratch"

  local table restored missing=0 total=0 loaded
  loaded=" $(tables_of "$scratch" | tr '\n' ' ') "
  printf '%-22s %12s %12s\n' "Table" "In backup" "In $DB_NAME"
  for table in $(tables_of "$DB_NAME"); do
    if [[ "$loaded" == *" $table "* ]]; then
      restored=$(rows_in "$scratch" "$table")
      total=$((total + restored))
    else
      restored="missing"
      missing=$((missing + 1))
    fi
    printf '%-22s %12s %12s\n' "$table" "$restored" "$(rows_in "$DB_NAME" "$table")"
  done
  mysql -e "DROP DATABASE \`$scratch\`"
  [ "$missing" -eq 0 ] || die "Restore check failed: $missing tables aren't in $name."
  [ "$total" -gt 0 ] || die "Restore check failed: $name has no rows at all."
  echo "Restore check passed: $name loads, with $total rows in $(tables_of "$DB_NAME" | wc -l) tables."
}

# Replaces the database with a backup. What was there is backed up first, in case.
restore() {
  local name="${1:-}"
  [ -n "$name" ] || die "Which backup? See: docker compose run --rm backup list (or use: restore latest)"
  [ "$name" != latest ] || name=$(newest)
  [ -n "$name" ] || die "No backups in $WHERE yet."
  if [ "${2:-}" != "--yes" ]; then
    [ -t 0 ] || die "Add --yes to replace $DB_NAME without being asked."
    read -r -p "This replaces everything in $DB_NAME with $name. Stop the app first (docker compose stop app). Type yes to go on: " answer
    [ "$answer" = yes ] || die "Cancelled."
  fi
  local file
  file=$(fetch "$name")
  if [ -n "$(tables_of "$DB_NAME")" ]; then
    echo "First, a backup of what's in $DB_NAME now:"
    "$0" now
  fi
  echo "Restoring $name ($(size_of "$file")) into $DB_NAME..."
  mysql -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\`"
  gunzip -c "$file" | mysql "$DB_NAME"
  echo "Restored $name. Start the app (docker compose start app): it brings the database up to date if the backup is older."
}

case "${1:-schedule}" in
  schedule) schedule ;;
  now) backup_now ;;
  list) list ;;
  check) check "${2:-}" ;;
  restore) restore "${2:-}" "${3:-}" ;;
  *) die "Usage: backup [schedule | now | list | check [name] | restore <name|latest> [--yes]]" ;;
esac
