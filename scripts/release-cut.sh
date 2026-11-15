#!/usr/bin/env bash
# The release cut PR (docs/release.md#cut-a-release). The Release cut workflow
# runs this after every push to main: it cuts the pending changes/ entries on a
# fresh release/next from main and opens or updates the one "Cut: next release"
# PR into main. Nothing pending is a no-op.
#
#   scripts/release-cut.sh [--dry-run]   # needs git, node, gh (GH_TOKEN) and a full clone
#
# With the workflow's own GITHUB_TOKEN (DISPATCH_CI=true, the default) it starts
# CI on release/next itself, and when GitHub refuses that token a new PR, it
# leaves a compare link in the job summary instead.
#
# release/next belongs to this script: every run that has something new replaces
# it. Its head commit records what it was cut from (Cut-From, Cut-Name trailers),
# so a run with nothing new changes nothing.
set -euo pipefail

BASE=${BASE:-main}
CUT_BRANCH=${CUT_BRANCH:-release/next}
TITLE='Cut: next release'
DRY=''
[ "${1:-}" = --dry-run ] && DRY=1

log() { printf 'release-cut: %s\n' "$*" >&2; }
write() { # write WHAT CMD...: a change on GitHub, or its description on a dry run
  local what=$1; shift
  if [ -n "$DRY" ]; then log "dry run: would $what"; else "$@"; fi
}

# The player-facing name of a rules-changing release: RELEASE_NAME (the
# workflow's manual input), else the open PR's "Release name:" line, else
# "Playtest <date>". The cut writes it into Rust, JavaScript and HTML strings
# and regex replacements, so only plain characters pass.
release_name() {
  local name=${RELEASE_NAME:-}
  [ -n "$name" ] || name=$(jq -r '[.body // "" | capture("Release name:[ \t]*(?<n>[^\r\n]*)").n][0] // ""' <<<"$1")
  name=${name%"${name##*[![:space:]]}"}
  if [[ ! "$name" =~ ^[A-Za-z0-9][A-Za-z0-9\ .,-]{0,59}$ ]]; then
    [ -z "$name" ] || log "ignoring release name '$name' (letters, digits, spaces and .,- only)"
    name="Playtest $(date -u +%F)"
  fi
  printf '%s' "$name"
}

declared_save() { git show "$1:prototypes/galactic-reach/app.js" | grep -oE 'const SAVE_FORMAT_VERSION = [0-9]+'; }

body() { # body MAIN NAME COMPAT REPORT
  cat <<EOF
The [Release cut workflow]($URL/actions/workflows/release-cut.yml) keeps this PR current: it is \`node scripts/release.cjs cut\` applied to \`$BASE\` at $1, cut again whenever \`$BASE\` moves. Commits pushed to \`$CUT_BRANCH\` are replaced, so fixes go in their own PR into \`$BASE\`.

Release name: $2

Edit the line above to rename a rules-changing release (letters, digits, spaces and \`.,-\`); the cut reruns with the new name. A save-compatible release, or one already named by an earlier cut this cycle, ignores it.

Compatibility: **$3**

\`\`\`
$4
\`\`\`

Review what the cut lists, check that CI passed on the head commit, merge this PR, then merge the Release PR (\`$BASE\` → \`stable\`) with a merge commit. See [docs/release.md]($URL/blob/$BASE/docs/release.md#cut-a-release).
EOF
}

git fetch --quiet --prune origin "+refs/heads/$BASE:refs/remotes/origin/$BASE" "+refs/heads/stable:refs/remotes/origin/stable"
git fetch --quiet origin "+refs/heads/$CUT_BRANCH:refs/remotes/origin/$CUT_BRANCH" 2>/dev/null ||
  git update-ref -d "refs/remotes/origin/$CUT_BRANCH"
main=$(git rev-parse "origin/$BASE")
URL=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
pr=$(gh pr list --base "$BASE" --head "$CUT_BRANCH" --state open --json number,body --jq '.[0] // {}')
number=$(jq -r '.number // empty' <<<"$pr")

if ! git ls-tree --name-only "origin/$BASE" changes/ | grep -v '^changes/README\.md$' | grep -q '\.md$'; then
  # Nothing pending. An open cut PR is stale: a cut (maybe by hand) already merged.
  if [ -n "$number" ]; then
    write "close stale PR #$number" gh pr close "$number" --comment "Nothing is pending on \`$BASE\` at $main: a cut already merged."
  fi
  log "nothing pending on $BASE ${main:0:12}"
  exit 0
fi

name=$(release_name "$pr")
head=''
git rev-parse -q --verify "origin/$CUT_BRANCH" >/dev/null && head=$(git rev-parse "origin/$CUT_BRANCH")
pushed=''
if [ -n "$head" ] &&
  [ "$(git log -1 --format='%(trailers:key=Cut-From,valueonly)' "$head" | head -1)" = "$main" ] &&
  [ "$(git log -1 --format='%(trailers:key=Cut-Name,valueonly)' "$head" | head -1)" = "$name" ]; then
  # Already cut. Reopen nothing a person closed: only a head that never had a
  # PR (an earlier run failed after its push) gets one.
  [ -z "$number" ] || { log "PR #$number already holds $BASE ${main:0:12} as '$name'"; exit 0; }
  if [ "$(gh pr list --base "$BASE" --head "$CUT_BRANCH" --state closed --json headRefOid --jq "any(.[]; .headRefOid == \"$head\")")" = true ]; then
    log "the cut of ${main:0:12} was closed by hand; waiting for the next $BASE commit"
    exit 0
  fi
else
  log "cutting $BASE ${main:0:12} as '$name'"
  git checkout --quiet --force -B "$CUT_BRANCH" "$main"
  report=$(node scripts/release.cjs cut --name "$name" --released origin/stable)
  printf '%s\n' "$report" >&2
  git add -A
  git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit --quiet --no-verify -m "$TITLE" -m "$report" -m "Cut-From: $main"$'\n'"Cut-Name: $name"
  write "push $CUT_BRANCH $(git rev-parse --short HEAD)" \
    git push --quiet --force-with-lease="refs/heads/$CUT_BRANCH:$head" origin "HEAD:refs/heads/$CUT_BRANCH"
  head=$(git rev-parse HEAD)
  pushed=1
fi

# The release's compatibility: does it change rules relative to stable?
compat=safe other=breaking
[ "$(declared_save "$head")" = "$(declared_save origin/stable)" ] || { compat=breaking other=safe; }
report=$(git log -1 --format=%b "$head" | sed '/^Cut-From: /,$d')
text=$(body "$main" "$name" "$compat" "$report")

# A push with the workflow's own GITHUB_TOKEN starts no other workflow, so start
# the checks on the new head by hand. (A GitHub App token's push starts them.)
if [ -n "$pushed" ] && [ "${DISPATCH_CI:-true}" = true ]; then
  for workflow in ci.yml rules.yml; do
    write "run $workflow on $CUT_BRANCH" gh workflow run "$workflow" --ref "$CUT_BRANCH" ||
      log "could not start $workflow on $CUT_BRANCH; run it from the Actions tab"
  done
fi

if [ -n "$number" ]; then
  write "update PR #$number ($compat)" gh pr edit "$number" --title "$TITLE" --body "$text" --add-label "playtest-$compat"
  write "unlabel PR #$number playtest-$other" gh pr edit "$number" --remove-label "playtest-$other" >/dev/null 2>&1 || true
elif ! write "open the cut PR ($compat)" gh pr create --base "$BASE" --head "$CUT_BRANCH" --title "$TITLE" --body "$text" --label "playtest-$compat"; then
  # GITHUB_TOKEN may not open PRs (an organization policy). The branch is cut;
  # leave a person the link and the description.
  link="$URL/compare/$BASE...$CUT_BRANCH?expand=1&title=Cut%3A+next+release&labels=playtest-$compat"
  echo "::warning title=Cut PR not opened::GitHub refused to open the cut PR with this token. Open it from $link (docs/release.md#cut-a-release)."
  cat >> "${GITHUB_STEP_SUMMARY:-/dev/stderr}" <<EOF
## Cut PR not opened

\`$CUT_BRANCH\` is cut from \`$BASE\` ${main:0:12}, but this token may not open pull requests. [Open the PR]($link) and paste this description:

\`\`\`\`markdown
$text
\`\`\`\`
EOF
  exit 0
fi
log "cut PR holds $BASE ${main:0:12} as '$name' ($compat)"
