#!/usr/bin/env bash
# Self-hosted dev channel (docs/release.md#dev-host): runs `main` in Docker and
# redeploys within a minute of each new commit, keeping one data directory so
# dev tables in progress survive every deploy.
#
#   dev-host.sh install   # once, as a sudoer: dirs, env file, systemd timer
#   dev-host.sh update    # the timer's job: fetch, and on a new commit build + restart
#   dev-host.sh status
#
# Settings live in $ROOT/dev-host.conf (BRANCH, PORT, IMAGE, CONTAINER) and the
# server's environment in $ROOT/dev.env (APP_ORIGIN, ACCOUNT_REGISTRATION_CODE,
# NIDO_WALLET_HOST, ...). Only the container, image, units and $ROOT belong to
# this script; it never touches other containers or services.
set -euo pipefail

ROOT=${DEV_HOST_ROOT:-/opt/drawing-board-dev}
BRANCH=${BRANCH:-main} PORT=${PORT:-3200} IMAGE=drawing-board-dev CONTAINER=drawing-board-dev
REPO_URL=https://github.com/CardBoardStudio/drawing_board.git
# shellcheck source=/dev/null
[ -f "$ROOT/dev-host.conf" ] && . "$ROOT/dev-host.conf"
UNIT=drawing-board-dev-update
APP_UID=10001 # the image's `app` user (Dockerfile)

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

cmd_install() {
  local me; me=$(id -un)
  sudo install -d -o "$me" -g "$me" "$ROOT" "$ROOT/bin"
  sudo install -d -o "$APP_UID" -g "$APP_UID" -m 700 "$ROOT/data"
  [ -d "$ROOT/repo/.git" ] || git clone --quiet "$REPO_URL" "$ROOT/repo"
  [ -f "$ROOT/dev-host.conf" ] || printf 'BRANCH=%s\nPORT=%s\n' "$BRANCH" "$PORT" > "$ROOT/dev-host.conf"
  if [ ! -f "$ROOT/dev.env" ]; then
    : "${APP_ORIGIN:?set APP_ORIGIN to the tailnet HTTPS origin of this host, e.g. https://host.tailnet.ts.net:$PORT}"
    (umask 077; printf 'APP_ORIGIN=%s\nACCOUNT_REGISTRATION_CODE=%s\nNIDO_WALLET_HOST=%s\nRUST_LOG=info\n' \
      "$APP_ORIGIN" "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')" "${NIDO_WALLET_HOST:-test.nido.fyi}" > "$ROOT/dev.env")
  fi
  install -m 755 "$0" "$ROOT/bin/dev-host.sh"
  local src; src=$(cd "$(dirname "$0")" && pwd)
  sed "s|@USER@|$me|; s|@ROOT@|$ROOT|g" "$src/$UNIT.service" | sudo tee "/etc/systemd/system/$UNIT.service" >/dev/null
  sudo install -m 644 "$src/$UNIT.timer" "/etc/systemd/system/$UNIT.timer"
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$UNIT.timer"
  log "installed; first build starts within a minute (journalctl -u $UNIT -f)"
  log "expose it tailnet-only once: sudo tailscale serve --bg --https=$PORT http://127.0.0.1:$PORT"
}

healthy() {
  for _ in $(seq 60); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

cmd_update() {
  exec 9>"$ROOT/update.lock"
  flock -n 9 || { log "an update is already running"; return 0; }
  cd "$ROOT/repo"
  git fetch --quiet origin "$BRANCH"
  local target running
  target=$(git rev-parse FETCH_HEAD)
  running=$(docker inspect -f '{{ index .Config.Labels "commit" }}' "$CONTAINER" 2>/dev/null || true)
  [ "$target" = "$running" ] && return 0
  log "deploying $BRANCH ${target:0:12} (was ${running:0:12})"
  git checkout --quiet --force --detach "$target"
  # Build first: a failed build leaves the running dev server untouched.
  docker build --quiet -t "$IMAGE:${target:0:12}" . >/dev/null
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    docker stop -t 10 "$CONTAINER" >/dev/null # the server closes live streams on SIGTERM
    docker rm "$CONTAINER" >/dev/null
  fi
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    --label "commit=$target" \
    -p "127.0.0.1:$PORT:3000" \
    -v "$ROOT/data:/app/data" \
    --env-file "$ROOT/dev.env" \
    -e GALACTIC_REACH_CHANNEL=dev -e "GIT_COMMIT=$target" \
    "$IMAGE:${target:0:12}" >/dev/null
  if healthy; then log "dev ${target:0:12} is up"; else log "dev ${target:0:12} failed its health check"; docker logs --tail 50 "$CONTAINER"; return 1; fi
  # Keep the three newest images for a manual rollback.
  docker image ls "$IMAGE" --format '{{.Tag}}' | tail -n +4 | while read -r tag; do docker rmi "$IMAGE:$tag" >/dev/null 2>&1 || true; done
}

cmd_status() {
  systemctl list-timers "$UNIT.timer" --no-pager || true
  docker ps --filter "name=^$CONTAINER\$" --format '{{.Names}} {{.Status}} {{.Label "commit"}}'
  curl -fsS "http://127.0.0.1:$PORT/api/health" && echo
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  status) cmd_status ;;
  *) echo "usage: $0 install|update|status" >&2; exit 2 ;;
esac
