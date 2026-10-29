#!/bin/bash
# Checks the whole of docker-compose.yml on this computer, the way a new server would run it:
#  1. Everything starts with one command, from nothing, and answers over HTTPS through Caddy.
#  2. A photo goes to file storage (a local S3-compatible server here), not MySQL, and loads from it.
#  3. Live updates get through Caddy.
#  4. A backup goes to file storage, old ones are removed, and the restore check passes.
#  5. The server "dies": the app, MySQL and their volumes are deleted. A new one starts, the
#     backup is restored onto it, and the same photo still loads.
# It needs Docker, and uses its own project (casa-fida-smoke) and port 8443, so it touches nothing
# else. Takes a few minutes, most of it building the images the first time.
#   deploy/smoke-test.sh          and KEEP=1 deploy/smoke-test.sh to leave it running afterwards
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=casa-fida-smoke
URL=https://localhost:8443
WORK="$(mktemp -d)"
ENV_FILE="$WORK/.env"

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml -f deploy/smoke-test.compose.yml "$@"
}

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- The app's log:" >&2
    compose logs --tail 40 app >&2 || true
  fi
  if [ "${KEEP:-}" = 1 ]; then
    echo "Left running: $URL (stop it with: docker compose -p $PROJECT down -v)"
  else
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
fail() { echo "FAILED: $*" >&2; exit 1; }
# curl with the certificate Caddy made for localhost, which nothing else trusts.
get() { curl -fsSk --max-time 20 "$@"; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s);console.log($1)})"; }

login() {
  local jar="$WORK/$1.cookies"
  get -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"CasaFida123\"}" "$URL/api/login" >/dev/null || fail "logging in as $1"
  echo "$jar"
}

cat > "$ENV_FILE" <<SETTINGS
DOMAIN=localhost
DB_PASSWORD=$(openssl rand -hex 16)
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
S3_ENDPOINT=http://s3:7070
S3_REGION=us-east-1
S3_BUCKET=casa-fida
S3_ACCESS_KEY_ID=smoke-test-key
S3_SECRET_ACCESS_KEY=smoke-test-secret
SENTRY_ENVIRONMENT=smoke-test
SETTINGS

step "1. Starting everything with one command"
compose down --volumes --remove-orphans >/dev/null 2>&1 || true
compose up --detach --build --wait --wait-timeout 300
for _ in $(seq 30); do get "$URL/api/health" >/dev/null 2>&1 && break; sleep 1; done
[ "$(get "$URL/api/health")" = '{"ok":true}' ] || fail "https://localhost:8443/api/health"
get "$URL/projects/1" | grep -q '<div id="root">' || fail "the app's page"
echo "The app answers on $URL, through Caddy."

step "2. A photo goes to file storage and loads from it"
compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" casa_fida 2>/dev/null' < db/seed.sql
marcus=$(login marcus.reid@example.com)
project=$(get -b "$marcus" "$URL/api/projects" | json "v.projects.find(p => p.title.startsWith('Rear extension')).id")
update=$(get -b "$marcus" -H 'Content-Type: application/json' -d '{"body":"Smoke test"}' \
  "$URL/api/projects/$project/updates" | json 'v.update.id')
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01smoke-test-%s' "$(openssl rand -hex 8)" > "$WORK/photo.jpg"
photo=$(get -b "$marcus" -H 'Content-Type: image/jpeg' --data-binary "@$WORK/photo.jpg" \
  "$URL/api/updates/$update/photos" | json 'v.photo.url')
emma=$(login emma.clarke@example.com)
get -b "$emma" -o "$WORK/loaded.jpg" "$URL$photo"
cmp -s "$WORK/photo.jpg" "$WORK/loaded.jpg" || fail "the photo Emma sees isn't the one Marcus uploaded"
compose exec -T s3 find /data/casa-fida/photos -type f | grep -q "photos/$update/" || fail "the photo isn't in the bucket"
compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N casa_fida -e "SHOW COLUMNS FROM update_photos" 2>/dev/null' \
  | grep -qw data && fail "update_photos still has a data column"
echo "Photo $photo is in the bucket, not in MySQL, and Emma sees it."

step "3. Live updates get through Caddy"
# The connection stays open, so curl gives up after 3 seconds with what it got.
curl -sk -N --max-time 3 -b "$emma" -D "$WORK/headers" "$URL/api/events" > "$WORK/events" || true
grep -qi '^content-type: text/event-stream' "$WORK/headers" || fail "live updates' content type"
grep -q '^retry: 5000' "$WORK/events" || fail "live updates were held back"
echo "The first event arrived straight away."

step "4. Backups"
# One made long ago, which the next backup removes.
compose exec -T s3 sh -c 'mkdir -p /data/casa-fida/backups && echo old | gzip > /data/casa-fida/backups/casa_fida-2020-01-01T030000Z.sql.gz'
compose run --rm -T backup now | tee "$WORK/backup.log"
grep -q 'Removed casa_fida-2020-01-01T030000Z.sql.gz' "$WORK/backup.log" || fail "the old backup wasn't removed"
compose run --rm -T backup list
compose run --rm -T backup check | tee "$WORK/check.log"
grep -q '^Restore check passed' "$WORK/check.log" || fail "the restore check"

step "5. The server dies, and a new one gets the backup"
compose rm --stop --force app db backup caddy
docker volume rm "${PROJECT}_db" "${PROJECT}_files" "${PROJECT}_backups" "${PROJECT}_caddy-data" "${PROJECT}_caddy-config" >/dev/null
compose up --detach --wait --wait-timeout 300
compose stop app
compose run --rm -T backup restore latest --yes
compose start app
for _ in $(seq 60); do get "$URL/api/health" >/dev/null 2>&1 && break; sleep 1; done
emma=$(login emma.clarke@example.com)
get -b "$emma" -o "$WORK/restored.jpg" "$URL$photo"
cmp -s "$WORK/photo.jpg" "$WORK/restored.jpg" || fail "the photo after restoring"
echo "Emma logs in on the new server and sees the same photo."

printf '\nAll checks passed.\n'
