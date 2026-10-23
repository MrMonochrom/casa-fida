#!/bin/sh
# Runs a local MySQL server for Casa Fida without installing anything system-wide.
# Its data lives in ~/.casa-fida (set CASA_FIDA_MYSQL_DIR to change it), on port 3307, so it
# never touches another app's database. If Be in touch's copy of MySQL is already downloaded in
# ~/.be-in-touch, it's used instead of downloading another one.
# To remove everything, stop the server and delete that folder.
#
# Usage: db/mysql.sh start | stop | status | users | shell | reset
set -eu

VERSION=8.4.13
PACKAGE="mysql-$VERSION-macos15-arm64"
DIR="${CASA_FIDA_MYSQL_DIR:-$HOME/.casa-fida}"
DATA="$DIR/data"
SOCK="$DIR/mysql.sock"
PIDFILE="$DIR/mysqld.pid"
LOG="$DIR/mysqld.log"
PORT="${CASA_FIDA_MYSQL_PORT:-3307}"
DB_DIR="$(cd "$(dirname "$0")" && pwd)"

# Our own copy if there is one, otherwise Be in touch's, otherwise our own (downloaded on start).
BASE="$DIR/$PACKAGE"
if [ ! -x "$BASE/bin/mysqld" ] && [ -x "$HOME/.be-in-touch/$PACKAGE/bin/mysqld" ]; then
  BASE="$HOME/.be-in-touch/$PACKAGE"
fi

client() {
  "$BASE/bin/mysql" --no-defaults -uroot --socket="$SOCK" --default-character-set=utf8mb4 "$@"
}

running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

require_running() {
  running || { echo "MySQL isn't running. Start it with: npm run db:start" >&2; exit 1; }
}

download() {
  [ -x "$BASE/bin/mysqld" ] && return
  if [ "$(uname -s)-$(uname -m)" != "Darwin-arm64" ]; then
    echo "This script only downloads MySQL for Apple silicon Macs. Install MySQL another way." >&2
    exit 1
  fi
  mkdir -p "$DIR"
  echo "Downloading MySQL $VERSION (about 165 MB)..."
  curl -fL --progress-bar -o "$DIR/mysql.tar.gz" \
    "https://dev.mysql.com/get/Downloads/MySQL-8.4/$PACKAGE.tar.gz"
  tar -xzf "$DIR/mysql.tar.gz" -C "$DIR"
  rm "$DIR/mysql.tar.gz"
}

start() {
  download
  if running; then
    echo "MySQL is already running on 127.0.0.1:$PORT."
    return
  fi
  mkdir -p "$DIR"

  fresh=false
  if [ ! -d "$DATA" ]; then
    echo "Creating the database folder..."
    "$BASE/bin/mysqld" --no-defaults --initialize-insecure \
      --basedir="$BASE" --datadir="$DATA" --log-error="$LOG"
    fresh=true
  fi

  # Only reachable from this computer, so root without a password is acceptable for local development.
  "$BASE/bin/mysqld" --no-defaults --daemonize \
    --basedir="$BASE" --datadir="$DATA" \
    --bind-address=127.0.0.1 --port="$PORT" --socket="$SOCK" \
    --pid-file="$PIDFILE" --log-error="$LOG" --mysqlx=OFF

  tries=0
  until client -e 'SELECT 1' >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "MySQL didn't start. See $LOG" >&2
      exit 1
    fi
    sleep 0.5
  done

  if $fresh; then
    echo "Creating tables and adding sample data..."
    client < "$DB_DIR/schema.sql"
    client < "$DB_DIR/seed.sql"
  fi
  echo "MySQL is running on 127.0.0.1:$PORT (database casa_fida, user root, no password)."
}

stop() {
  if ! running; then
    echo "MySQL isn't running."
    return
  fi
  "$BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCK" shutdown
  echo "MySQL stopped."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status)
    if running; then echo "MySQL is running on 127.0.0.1:$PORT."; else echo "MySQL isn't running."; fi
    ;;
  users)
    require_running
    client casa_fida --table -e "
      SELECT u.id, u.role, u.name, u.email, b.business_name, b.service_area,
             GROUP_CONCAT(t.trade ORDER BY t.trade SEPARATOR ', ') AS trades
      FROM users u
      LEFT JOIN builder_profiles b ON b.user_id = u.id
      LEFT JOIN builder_trades t ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY u.role, u.id;"
    ;;
  shell)
    require_running
    client casa_fida
    ;;
  reset)
    printf 'This deletes every account, job, project and message and reloads the sample data. Type "yes" to continue: '
    read -r answer
    [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
    stop
    rm -rf "$DATA"
    start
    ;;
  *)
    echo "Usage: $0 start | stop | status | users | shell | reset" >&2
    exit 1
    ;;
esac
