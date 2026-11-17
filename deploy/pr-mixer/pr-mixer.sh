#!/usr/bin/env bash
# PR mixer (docs/pr-mixer.md): a dev-only service that builds main plus chosen
# PRs and serves each combination with its own throwaway database.
#
#   pr-mixer.sh check     # can this machine host it? (CPU, memory, disk, tools)
#   pr-mixer.sh install   # Linux dev host, as a sudoer: env file, builder, systemd unit
#   pr-mixer.sh status
#   pr-mixer.sh run       # foreground, for a laptop (see "On the Mac" in the doc)
#
# Everything lives under $ROOT (default /opt/drawing-board-dev/mixer, beside
# the dev host's own directory). Settings: $ROOT/mixer.env. Only the
# drawing-board-pr-mixer unit, the pr-mixer BuildKit builder and Docker objects
# named pr-mix* belong to this script; it never touches the dev site.
set -euo pipefail

ROOT=${PR_MIXER_ROOT:-/opt/drawing-board-dev/mixer}
UNIT=drawing-board-pr-mixer
BUILDER=pr-mixer
SRC=$(cd "$(dirname "$0")" && pwd)
MIN_CPUS=4 MIN_MEM_GB=8 MIN_DISK_GB=40

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

cmd_check() {
  local ok=1 cpus mem_gb disk_gb node_major git_minor
  cpus=$(getconf _NPROCESSORS_ONLN)
  if [ -r /proc/meminfo ]; then mem_gb=$(awk '/MemTotal/ {print int($2/1048576)}' /proc/meminfo)
  else mem_gb=$(( $(sysctl -n hw.memsize) / 1073741824 )); fi
  # Docker's own disk on Linux; on a Mac it lives in a VM, so measure the home disk.
  local docker_dir; docker_dir=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)
  [ -d "$docker_dir" ] || docker_dir=$HOME
  disk_gb=$(df -Pk "$docker_dir" | awk 'NR==2 {print int($4/1048576)}')
  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  git_minor=$(git version | awk '{split($3, v, "."); print v[1] * 100 + v[2]}')
  report() { if [ "$1" = ok ]; then printf '  ok    %s\n' "$2"; else printf '  FAIL  %s\n' "$2"; ok=0; fi; }
  echo "PR mixer host check:"
  report "$([ "$cpus" -ge $MIN_CPUS ] && echo ok)" "$cpus CPUs (need $MIN_CPUS; a mix build is a full release build)"
  report "$([ "$mem_gb" -ge $MIN_MEM_GB ] && echo ok)" "${mem_gb} GB memory (need $MIN_MEM_GB: the dev site, a build and running mixes)"
  report "$([ "${disk_gb:-0}" -ge $MIN_DISK_GB ] && echo ok)" "${disk_gb:-?} GB free for Docker (need $MIN_DISK_GB: images ~1 GB each plus a build cache capped at MIXER_BUILD_CACHE)"
  report "$([ "$node_major" -ge 20 ] && echo ok)" "node $node_major (need 20+)"
  report "$([ "$git_minor" -ge 238 ] && echo ok)" "git $(git version | awk '{print $3}') (need 2.38+ for merge-tree --write-tree)"
  report "$(docker buildx version >/dev/null 2>&1 && echo ok)" "docker buildx"
  if [ $ok = 1 ]; then echo "This machine can host the PR mixer."; else echo "Not enough for the PR mixer; see docs/pr-mixer.md for the Mac fallback."; return 1; fi
}

ensure_builder() {
  # Its own BuildKit: PR code never shares the dev site's build cache mounts.
  docker buildx inspect "$BUILDER" >/dev/null 2>&1 || docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
}

cmd_install() {
  cmd_check
  local me; me=$(id -un)
  sudo install -d -o "$me" -g "$me" "$ROOT" "$ROOT/app"
  install -m 644 "$SRC"/lib.mjs "$SRC"/git.mjs "$SRC"/pr-mixer.mjs "$SRC"/ui.html "$ROOT/app/"
  if [ ! -f "$ROOT/mixer.env" ]; then
    : "${MIXER_ORIGIN:?set MIXER_ORIGIN to the tailnet HTTPS origin of this host, e.g. https://host.tailnet.ts.net:3300}"
    (umask 077; printf 'MIXER_ORIGIN=%s\nMIXER_AUTH=dev-site\nMIXER_DATA=%s\nDEV_SITE_URL=http://127.0.0.1:3200\n' \
      "$MIXER_ORIGIN" "$ROOT/data" > "$ROOT/mixer.env")
  fi
  ensure_builder
  sed "s|@USER@|$me|; s|@ROOT@|$ROOT|g" "$SRC/$UNIT.service" | sudo tee "/etc/systemd/system/$UNIT.service" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$UNIT.service"
  sudo systemctl restart "$UNIT.service" # pick up new app files on a reinstall
  log "installed; expose it tailnet-only once: sudo tailscale serve --bg --https=3300 http://127.0.0.1:3300"
}

cmd_status() {
  systemctl status "$UNIT" --no-pager 2>/dev/null | head -5 || true
  docker ps -a --filter label=pr-mixer.key --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
  docker image ls pr-mix --format '{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}'
  docker buildx du --builder "$BUILDER" 2>/dev/null | tail -1 || true
}

cmd_run() {
  ensure_builder
  exec node "$SRC/pr-mixer.mjs"
}

case "${1:-}" in
  check) cmd_check ;;
  install) cmd_install ;;
  status) cmd_status ;;
  run) cmd_run ;;
  *) echo "usage: $0 check|install|status|run" >&2; exit 2 ;;
esac
