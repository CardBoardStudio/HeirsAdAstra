#!/usr/bin/env bash
# Self-hosted copies of the game (docs/release.md#dev-host). Each instance runs
# one branch in Docker, redeploys within a minute of each new commit, and keeps
# one data directory so tables in progress survive every deploy. Two instances
# can share a machine; DEV_HOST_INSTANCE picks one:
#
#   dev     (the default) `main`, the dev channel, /opt/drawing-board-dev, port 3200
#   stable  `stable`, the released rules, /opt/drawing-board-stable, port 3201
#
#   dev-host.sh install   # once, as a sudoer: dirs, env file, systemd timer
#   dev-host.sh update    # the timer's job: fetch, and on a new commit build + restart
#   dev-host.sh status
#   dev-host.sh archive   # timestamped copy of data/ under $ROOT/archive (stops the server briefly)
#   dev-host.sh config    # print the resolved names; changes nothing
#
# Settings live in $ROOT/dev-host.conf (BRANCH, PORT, IMAGE, CONTAINER) and the
# server's environment in $ROOT/<instance>.env (APP_ORIGIN, ACCESS,
# NIDO_WALLET_HOST, ...). Only the instance's container, image, units and $ROOT
# belong to this script; it never touches other containers or services.
set -euo pipefail

INSTANCE=${DEV_HOST_INSTANCE:-dev}
case $INSTANCE in
  dev) DEFAULT_ROOT=/opt/drawing-board-dev DEFAULT_BRANCH=main DEFAULT_PORT=3200 CHANNEL=dev ;;
  # The server deals released rules unless GALACTIC_REACH_CHANNEL=dev, as on Render.
  stable) DEFAULT_ROOT=/opt/drawing-board-stable DEFAULT_BRANCH=stable DEFAULT_PORT=3201 CHANNEL= ;;
  *) echo "DEV_HOST_INSTANCE must be dev or stable, not '$INSTANCE'" >&2; exit 2 ;;
esac
ROOT=${DEV_HOST_ROOT:-$DEFAULT_ROOT}
BRANCH=${BRANCH:-$DEFAULT_BRANCH} PORT=${PORT:-$DEFAULT_PORT}
IMAGE=drawing-board-$INSTANCE CONTAINER=drawing-board-$INSTANCE
REPO_URL=https://github.com/CardBoardStudio/drawing_board.git
# shellcheck source=/dev/null
[ -f "$ROOT/dev-host.conf" ] && . "$ROOT/dev-host.conf"
ENV_FILE=$INSTANCE.env
UNIT=drawing-board-$INSTANCE-update
APP_UID=10001 # the image's `app` user (Dockerfile)

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "$*" >&2; exit 1; }

# An installed copy (<root>/bin/dev-host.sh) acts only on its own root, so the
# stable copy run without DEV_HOST_INSTANCE=stable cannot reach dev.
home=$(cd "$(dirname "$0")/.." && pwd -P)
if [ "$(basename "$(dirname "$0")")" = bin ] && [ -f "$home/dev-host.conf" ] &&
  [ "$home" != "$(cd "$ROOT" 2>/dev/null && pwd -P)" ]; then
  die "this copy belongs to $home, not $ROOT; set DEV_HOST_INSTANCE (and DEV_HOST_ROOT for a custom root)"
fi

cmd_install() {
  if [ ! -f "$ROOT/$ENV_FILE" ]; then
    : "${APP_ORIGIN:?set APP_ORIGIN to the public HTTPS origin your tunnel or reverse proxy serves from http://127.0.0.1:$PORT, e.g. https://play.example.com}"
    case $APP_ORIGIN in https://*) ;; *) die "APP_ORIGIN must be an https:// origin, not $APP_ORIGIN" ;; esac
  fi
  local me; me=$(id -un)
  sudo install -d -o "$me" -g "$me" "$ROOT" "$ROOT/bin"
  sudo install -d -o "$APP_UID" -g "$APP_UID" -m 700 "$ROOT/data"
  [ -d "$ROOT/repo/.git" ] || git clone --quiet "$REPO_URL" "$ROOT/repo"
  [ -f "$ROOT/dev-host.conf" ] || printf 'BRANCH=%s\nPORT=%s\n' "$BRANCH" "$PORT" > "$ROOT/dev-host.conf"
  if [ ! -f "$ROOT/$ENV_FILE" ]; then
    # Invite-only by default: Nido accounts with an invitation (docs/invite-only.md).
    (umask 077; printf 'APP_ORIGIN=%s\nACCESS=%s\nNIDO_WALLET_HOST=%s\nRUST_LOG=info\n' \
      "$APP_ORIGIN" "${ACCESS:-invite-only}" "${NIDO_WALLET_HOST:-test.nido.fyi}" > "$ROOT/$ENV_FILE")
  fi
  install -m 755 "$0" "$ROOT/bin/dev-host.sh"
  local src; src=$(cd "$(dirname "$0")" && pwd)
  local fill="s|@USER@|$me|; s|@ROOT@|$ROOT|g; s|@INSTANCE@|$INSTANCE|g; s|@BRANCH@|$BRANCH|g"
  sed "$fill" "$src/update.service" | sudo tee "/etc/systemd/system/$UNIT.service" >/dev/null
  sed "$fill" "$src/update.timer" | sudo tee "/etc/systemd/system/$UNIT.timer" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$UNIT.timer"
  log "installed; first build starts within a minute (journalctl -u $UNIT -f)"
  log "serve $(sed -n 's/^APP_ORIGIN=//p' "$ROOT/$ENV_FILE") from http://127.0.0.1:$PORT through your HTTPS tunnel or reverse proxy"
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
  # Build first: a failed build leaves the running server untouched.
  docker build --quiet -t "$IMAGE:${target:0:12}" . >/dev/null
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    docker stop -t 10 "$CONTAINER" >/dev/null # the server closes live streams on SIGTERM
    docker rm "$CONTAINER" >/dev/null
  fi
  local channel=()
  [ -z "$CHANNEL" ] || channel=(-e "GALACTIC_REACH_CHANNEL=$CHANNEL")
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    --label "commit=$target" \
    -p "127.0.0.1:$PORT:3000" \
    -v "$ROOT/data:/app/data" \
    --env-file "$ROOT/$ENV_FILE" \
    ${channel[@]+"${channel[@]}"} -e "GIT_COMMIT=$target" \
    "$IMAGE:${target:0:12}" >/dev/null
  if healthy; then log "$INSTANCE ${target:0:12} is up"; else log "$INSTANCE ${target:0:12} failed its health check"; docker logs --tail 50 "$CONTAINER"; return 1; fi
  # Keep the three newest images for a manual rollback.
  docker image ls "$IMAGE" --format '{{.Tag}}' | tail -n +4 | while read -r tag; do docker rmi "$IMAGE:$tag" >/dev/null 2>&1 || true; done
}

cmd_status() {
  systemctl list-timers "$UNIT.timer" --no-pager || true
  docker ps --filter "name=^$CONTAINER\$" --format '{{.Names}} {{.Status}} {{.Label "commit"}}'
  curl -fsS "http://127.0.0.1:$PORT/api/health" && echo
}

# Stop, copy, start. The database runs in WAL mode, so copying the files of a
# running server can catch a write half-done; the runtime image has no sqlite3
# for an online backup. Stopped, the server has closed the database and the files
# on disk are consistent. The copy runs in the instance's own image as root, so
# it keeps data/'s owner and mode and needs no sudo. Holding the update lock keeps
# the timer from replacing the container meanwhile. Nothing is ever deleted.
restart() {
  docker start "$CONTAINER" >/dev/null || { log "could not start $CONTAINER"; return; }
  if healthy; then log "$CONTAINER is back up"; else log "$CONTAINER failed its health check"; fi
}

cmd_archive() {
  exec 9>"$ROOT/update.lock"
  flock -n 9 || die "an update is running; archive again once it finishes"
  local name image
  name=data-$(date -u +%Y%m%dT%H%M%SZ)
  [ ! -e "$ROOT/archive/$name" ] || die "$ROOT/archive/$name already exists"
  image=$(docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null ||
    docker image ls "$IMAGE" --format '{{.Repository}}:{{.Tag}}' | head -n 1)
  [ -n "$image" ] || die "no $IMAGE image to copy with; run update first"
  install -d -m 700 "$ROOT/archive"
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = true ]; then
    log "stopping $CONTAINER for a consistent copy"
    trap restart EXIT # also after a failed copy
    docker stop -t 10 "$CONTAINER" >/dev/null
  fi
  docker run --rm --network none --user 0 --entrypoint cp \
    -v "$ROOT/data:/from:ro" -v "$ROOT/archive:/to" \
    "$image" -a /from "/to/$name"
  log "archived $ROOT/data to $ROOT/archive/$name"
}

cmd_config() {
  printf '%s=%s\n' INSTANCE "$INSTANCE" ROOT "$ROOT" BRANCH "$BRANCH" PORT "$PORT" \
    IMAGE "$IMAGE" CONTAINER "$CONTAINER" ENV_FILE "$ROOT/$ENV_FILE" LOCK "$ROOT/update.lock" \
    UNIT "$UNIT" GALACTIC_REACH_CHANNEL "$CHANNEL"
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  status) cmd_status ;;
  archive) cmd_archive ;;
  config) cmd_config ;;
  *) echo "usage: [DEV_HOST_INSTANCE=dev|stable] $0 install|update|status|archive|config" >&2; exit 2 ;;
esac
