#!/bin/sh
# Runs a local MySQL server for Casa Fida, on port 3307 so it never touches another app's database.
#
# On a Mac with Apple silicon it downloads MySQL into ~/.casa-fida (set CASA_FIDA_MYSQL_DIR to change
# it) and runs it from there, without installing anything system-wide. If Be in touch's copy of
# MySQL is already downloaded in ~/.be-in-touch, it's used instead of downloading another one.
# Everywhere else (Linux, Windows with WSL, Intel Macs) it runs MySQL in Docker, in a container
# called casa-fida-mysql with its data in a Docker volume of the same name. Set CASA_FIDA_MYSQL=docker
# to use Docker on an Apple silicon Mac too.
#
# A new database gets the tables and the sample data. To remove everything, run reset, or stop the
# server and delete the folder (or the container and the volume).
#
# Usage: db/mysql.sh start | stop | status | users | shell | reset
set -eu

VERSION=8.4.13
PORT="${CASA_FIDA_MYSQL_PORT:-3307}"
DB_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="${CASA_FIDA_MYSQL_DIR:-$HOME/.casa-fida}"
# Photos uploaded while trying the app (see server/storage.ts): they go with the database on reset.
FILES="${STORAGE_DIR:-$HOME/.casa-fida/files}"

if [ "$(uname -s)-$(uname -m)" = "Darwin-arm64" ] && [ "${CASA_FIDA_MYSQL:-}" != "docker" ]; then
  MODE=download
else
  MODE=docker
fi

# ---------- MySQL downloaded into ~/.casa-fida (Apple silicon Macs) ----------

PACKAGE="mysql-$VERSION-macos15-arm64"
DATA="$DIR/data"
SOCK="$DIR/mysql.sock"
PIDFILE="$DIR/mysqld.pid"
LOG="$DIR/mysqld.log"

# Our own copy if there is one, otherwise Be in touch's, otherwise our own (downloaded on start).
BASE="$DIR/$PACKAGE"
if [ ! -x "$BASE/bin/mysqld" ] && [ -x "$HOME/.be-in-touch/$PACKAGE/bin/mysqld" ]; then
  BASE="$HOME/.be-in-touch/$PACKAGE"
fi

download() {
  [ -x "$BASE/bin/mysqld" ] && return
  mkdir -p "$DIR"
  echo "Downloading MySQL $VERSION (about 165 MB)..."
  curl -fL --progress-bar -o "$DIR/mysql.tar.gz" \
    "https://dev.mysql.com/get/Downloads/MySQL-8.4/$PACKAGE.tar.gz"
  tar -xzf "$DIR/mysql.tar.gz" -C "$DIR"
  rm "$DIR/mysql.tar.gz"
}

start_downloaded() {
  download
  mkdir -p "$DIR"
  if [ ! -d "$DATA" ]; then
    echo "Creating the database folder..."
    "$BASE/bin/mysqld" --no-defaults --initialize-insecure \
      --basedir="$BASE" --datadir="$DATA" --log-error="$LOG"
  fi
  # Only reachable from this computer, so root without a password is acceptable for local development.
  "$BASE/bin/mysqld" --no-defaults --daemonize \
    --basedir="$BASE" --datadir="$DATA" \
    --bind-address=127.0.0.1 --port="$PORT" --socket="$SOCK" \
    --pid-file="$PIDFILE" --log-error="$LOG" --mysqlx=OFF
}

# ---------- MySQL in Docker (everywhere else) ----------

CONTAINER=casa-fida-mysql
VOLUME=casa-fida-mysql

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "This needs Docker to run MySQL here: install Docker Desktop (or Docker Engine on Linux), or run" >&2
    echo "MySQL 8.4 another way and point DB_HOST, DB_PORT, DB_USER and DB_PASSWORD at it (see README.md)." >&2
    exit 1
  fi
  docker info >/dev/null 2>&1 || { echo "Docker isn't running. Start it, then try again." >&2; exit 1; }
}

start_in_docker() {
  require_docker
  if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    docker start "$CONTAINER" >/dev/null
  else
    echo "Starting MySQL $VERSION in Docker (the first time downloads it, about 250 MB)..."
    # Published on this computer only, so root without a password is acceptable for local development.
    docker run --detach --name "$CONTAINER" --restart unless-stopped \
      --publish "127.0.0.1:$PORT:3306" \
      --env MYSQL_ALLOW_EMPTY_PASSWORD=yes \
      --volume "$VOLUME:/var/lib/mysql" \
      "mysql:$VERSION" --mysqlx=OFF >/dev/null
  fi
}

# ---------- Both ----------

client() {
  if [ "$MODE" = download ]; then
    "$BASE/bin/mysql" --no-defaults -uroot --socket="$SOCK" --default-character-set=utf8mb4 "$@"
  else
    # Over TCP, so it only reaches the real server, not the one the image runs while it sets up.
    if [ -t 0 ]; then tty=-it; else tty=-i; fi
    docker exec "$tty" "$CONTAINER" mysql -uroot -h127.0.0.1 --default-character-set=utf8mb4 "$@"
  fi
}

running() {
  if [ "$MODE" = download ]; then
    [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
  else
    command -v docker >/dev/null 2>&1 &&
      [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = true ]
  fi
}

where() {
  if [ "$MODE" = download ]; then echo "127.0.0.1:$PORT"; else echo "127.0.0.1:$PORT, in Docker"; fi
}

require_running() {
  running || { echo "MySQL isn't running. Start it with: npm run db:start" >&2; exit 1; }
}

start() {
  if running; then
    echo "MySQL is already running on $(where)."
    return
  fi
  if [ "$MODE" = download ]; then start_downloaded; else start_in_docker; fi

  # Up to a minute; Docker's first start sets up the database before it answers.
  tries=0
  until client -e 'SELECT 1' >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 120 ]; then
      if [ "$MODE" = download ]; then echo "MySQL didn't start. See $LOG" >&2; else echo "MySQL didn't start. See: docker logs $CONTAINER" >&2; fi
      exit 1
    fi
    sleep 0.5
  done

  if [ -z "$(client -N -e "SHOW DATABASES LIKE 'casa_fida'" < /dev/null)" ]; then
    echo "Creating tables and adding sample data..."
    client < "$DB_DIR/schema.sql"
    client < "$DB_DIR/seed.sql"
  fi
  echo "MySQL is running on $(where) (database casa_fida, user root, no password)."
}

stop() {
  if ! running; then
    echo "MySQL isn't running."
    return
  fi
  if [ "$MODE" = download ]; then
    "$BASE/bin/mysqladmin" --no-defaults -uroot --socket="$SOCK" shutdown
  else
    docker stop "$CONTAINER" >/dev/null
  fi
  echo "MySQL stopped."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status)
    if running; then echo "MySQL is running on $(where)."; else echo "MySQL isn't running."; fi
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
      ORDER BY u.role, u.id;" < /dev/null
    ;;
  shell)
    require_running
    client casa_fida
    ;;
  reset)
    printf 'This deletes every account, job, project, message and photo and reloads the sample data. Type "yes" to continue: '
    read -r answer
    [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
    if [ "$MODE" = download ]; then
      stop
      rm -rf "$DATA"
    else
      require_docker
      docker rm --force "$CONTAINER" >/dev/null 2>&1 || true
      docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    fi
    rm -rf "$FILES"
    start
    ;;
  *)
    echo "Usage: $0 start | stop | status | users | shell | reset" >&2
    exit 1
    ;;
esac
