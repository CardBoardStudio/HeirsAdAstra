# Galactic Reach releases

Two channels, two branches:

| Channel | Branch | Host | What it plays |
| --- | --- | --- | --- |
| **Dev** | `main` | Self-hosted [dev host](#dev-host) (`deploy/dev-host/`), tailnet only | Every merged PR, live about a minute after the merge plus a build |
| **Stable** | `stable` | Render `drawing-board` (<https://drawing-board-p0g3.onrender.com/>) | The last release |

Change PRs merge into `main` and go live on dev. Several merges later, one release cut bumps the version once. Merging the standing **Release PR** (`main` → `stable`) is the release. Nothing commits to `stable` directly, so `stable` is always an earlier `main` commit.

## Change PRs

1. Branch from `origin/main` and open the PR into `main`. Apply `playtest-safe` or `playtest-breaking` as before.
2. Pair every logic change with its rulebook update in the same PR. In the rulebook prose, write "this playtest", not a version number. The cut updates version labels.
3. If players would notice the change, add one entry in `changes/` ([format](../changes/README.md)). Use `compat: breaking` for `playtest-breaking` work.
4. Do not touch `SAVE_FORMAT_VERSION`, `RULES_REVISION`, `RULES`, `EXPERIMENT`, the "New in this playtest" panel, `crates/galactic-reach/rules/`, `scripts/archive-hashes/`, or an existing `changes/` entry. The `Rules contract` CI job enforces this with `node scripts/release.cjs check`.

Two PRs never conflict over version numbers or release notes: each one adds its own entry file.

## Dev channel

Every merge to `main` deploys to the dev host automatically. The dev site deals rules named `<released>+dev.<n>` (for example `34.39+dev.2`), where `n` counts the `compat: breaking` entries waiting in `changes/`. The page badge shows `dev · 34.39+dev.2 · <commit>`. A `+dev.` revision never equals a released one, and the dev site has its own origin, database, and browser save keys, so dev play never mixes with stable play.

Games in progress survive merges:

- **Save-compatible merge** (no new breaking entry): the dev revision stays the same. Tables resume from their snapshots on the new build, and browsers get the new interface at once.
- **Rules-changing merge** (a new breaking entry): `n` increases. New tables use the new rules. A table already in progress keeps the engine it was dealt with. The server stores each dev revision's `app.js` and `adapter.js` in its database (`gr_rule_builds`) and opens the table at `/galactic-reach/dev/<revision>/`. That page runs the kept engine with the current interface files (styles, layout, rulebook).
- **Pruning:** a kept revision is deleted once no unfinished shared table plays it and it has not been current for 14 days. The 14 days cover solo games, which live in browsers the server cannot see. Finish a solo dev game within that window, at `/galactic-reach/dev/<revision>/`.

Interface edits inside `app.js` reach only tables on the current dev revision. A table on an older dev revision keeps that revision's `app.js`. Keep `index.html` changes additive within a release cycle, because older kept engines still run against it.

`crates/server/src/shared/tests.rs` (`a_dev_table_keeps_its_build_when_a_rules_change_deploys`) covers this: build A deals a table, build B changes rules, the table keeps A's rules and keeps playing, and then an interface-only build B′ reaches both tables.

## Cut a release

The standing Release PR (`main` → `stable`) always shows what is unreleased. Render previews only PRs into a service's own branch, so the Release PR is the one PR with a Render preview; change PRs into `main` are checked locally (`scripts/dev.sh`) and then on the dev host after merge. Its Render preview, a PR preview of the stable service, runs the batch exactly as it would ship. When the batch is ready:

```sh
git switch -c release/cut origin/main
git fetch origin stable
node scripts/release.cjs status                    # pending entries, next version, dev revision
node scripts/release.cjs cut --name "Harbor Ships playtest"
```

If any pending entry is `breaking`, `cut` makes a single version bump for the whole batch (`34.39` → `35.40`). It then:

- archives the released engine and browser files byte for byte from `origin/stable` into `crates/galactic-reach/rules/v34-*`, with hashes in `scripts/archive-hashes/v34.json`;
- adds the archived revision to `SHARED_RULES`, the engine's `include_str!` arms, the saved-table validator, `build-web.sh`, and the saved-table and replay routes;
- updates `RULES`, `EXPERIMENT`, the version constants, cache-busting queries, the rulebook masthead, and the tests that assert the current version;
- writes `docs/releases.md` and the game's "New in this playtest" panel from the entries, then deletes the entries.

A batch with only `safe` entries makes no bump. It writes a save-compatible update section, and games in progress continue. `--name` is needed only when rules change. Rerunning `cut` later in the same cycle adds newly merged entries to the same release without bumping again.

Then review what the script lists (rulebook prose, the catalog description), run the checks from [AGENTS.md](../AGENTS.md#verification) plus `node scripts/test-release.cjs`, and open `release/cut` as a PR into `main` labelled with the release's compatibility. Merge it. The Release PR now contains the bump. Verify the Release PR's preview, announce the reset if rules changed, and merge the Release PR with a **merge commit** (squash or rebase would detach `stable` from `main`). Render deploys `stable`. Verify the stable deployment's game and rulebook.

The same check fails a Release PR that still has pending entries: cut them first.

## Worked example

1. PR A (`playtest-safe`) adds `changes/wider-hexes.md` (`compat: safe`). It merges, and dev redeploys as `34.39+dev.0`. A table dealt earlier resumes on the new build with wider hexes.
2. PR B (`playtest-breaking`) adds `changes/harbors.md` (`compat: breaking`) and its rulebook section. It merges, and dev deals `34.39+dev.1`. The earlier table keeps `+dev.0`'s engine at `/galactic-reach/dev/34.39+dev.0/`.
3. `node scripts/release.cjs cut --name "Harbor playtest"` on `release/cut` bumps once to `35.40`, archives stable's `34.39` as `v34-*`, and writes one release section with both entries. Its PR merges into `main`, and dev deals `35.40+dev.0`.
4. The Release PR `main` → `stable` merges. Stable serves `35.40`, and unfinished stable `34.39` tables continue on the `v34` archive.

`scripts/test-release.cjs` runs this sequence in a scratch clone.

## One-time setup

1. Create `stable` from the commit the stable site serves now: `git push origin <deployed-commit>:refs/heads/stable`. Use the commit in the latest successful stable deployment; normally this is `origin/main` before any post-release merge.
2. Merge the PR that adds this process. The Blueprint (`render.yaml`) points `drawing-board` at `stable`; sync it in Render.
3. Set up a [dev host](#dev-host), or point an existing one at `main` (`BRANCH=main` in its `dev-host.conf`).
4. Open the standing Release PR: `main` → `stable`, titled "Release: next".
5. Optionally protect `stable` so only PR merges reach it.

## Dev host

Any Linux machine with Docker, git and systemd can be the dev host. `deploy/dev-host/dev-host.sh` keeps everything under `/opt/drawing-board-dev` (`DEV_HOST_ROOT`): the checkout, a persistent `data/` directory for the dev SQLite database and kept engines, `dev.env` (the server's environment, mode 600), and `dev-host.conf` (`BRANCH`, `PORT`).

```sh
git clone https://github.com/CardBoardStudio/drawing_board.git /tmp/drawing-board
APP_ORIGIN=https://<host>.<tailnet>.ts.net:3200 NIDO_WALLET_HOST=test.nido.fyi \
  /tmp/drawing-board/deploy/dev-host/dev-host.sh install
sudo tailscale serve --bg --https=3200 http://127.0.0.1:3200   # tailnet only
```

`install` creates the directories, generates an `ACCOUNT_REGISTRATION_CODE`, and enables the `drawing-board-dev-update.timer` systemd timer. Every minute the timer runs `dev-host.sh update`, which fetches `origin/<BRANCH>`. On a new commit it builds the repository's Dockerfile and only then replaces the `drawing-board-dev` container. The container is bound to `127.0.0.1:<PORT>`, mounts the same `data/` directory, and runs with `GALACTIC_REACH_CHANNEL=dev` and `GIT_COMMIT`. A failed build leaves the running server alone. The three newest images are kept for a manual rollback.

- Status: `/opt/drawing-board-dev/bin/dev-host.sh status`. Logs: `journalctl -u drawing-board-dev-update` and `docker logs drawing-board-dev`.
- Accounts: share the registration code from `dev.env` privately with testers, or create an administrator with `docker exec drawing-board-dev drawing-board bootstrap-admin` and use invitations ([local hosting](local-hosting.md#set-up-the-administrator)).
- Back up `data/` with SQLite-aware tooling; deleting it resets every dev table and account.

## Legacy preview identifiers

A cut skips identifiers already owned by published experiment archives. The workstation migration preserves 35.40 and 36.41, so the batch after stable 34.39 uses 37.42. This is one release cut; the old previews keep their engines and manuals. Later entries join that same cut until stable catches up. The next cut after stable 37.42 is 38.43.
