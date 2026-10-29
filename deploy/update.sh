#!/bin/sh
# Updates a server to the newest Casa Fida on its branch: backs up the database first, gets the new
# code, builds it and swaps it in. The app brings the database up to date as it starts.
#   deploy/update.sh
set -eu
cd "$(dirname "$0")/.."

docker compose run --rm -T backup now
git pull --ff-only
# The commit goes with error reports, to tell versions apart.
APP_VERSION="$(git rev-parse --short HEAD)" docker compose up --detach --build --wait
docker image prune --force >/dev/null
echo "Casa Fida $(git rev-parse --short HEAD) is running."
