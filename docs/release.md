# Galactic Reach releases

Two channels, two branches:

| Channel | Branch | Host | What it plays |
| --- | --- | --- | --- |
| **Dev** | `main` | Self-hosted [dev host](#dev-host) (`deploy/dev-host/`), behind an HTTPS tunnel or reverse proxy | Every merged PR, live about a minute after the merge plus a build |
| **Stable** | `stable` | Render `drawing-board` (<https://drawing-board-p0g3.onrender.com/>), and optionally a self-hosted [stable instance](#stable-instance) | The last release |

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
- **Private tables** (solo games saved to an account) follow the same rule. The save names the dev revision it was dealt with (`state.devRules`); `solo_tables.rules_version` names only the released rules (`38.43`), so the server reads the revision from the save. `GET /api/tables/<id>` returns it as `dev_rules`, with `dev_client`: the page that runs it, or `null` if this host no longer keeps that engine. `table.js` keeps the table on the current page when the page plays the dealt revision, and otherwise sends it to `dev_client`. With no kept engine, it says so and leaves the save alone. It seeds the save under the engine's own storage keys (`createGalacticReach.storageKeys()`; an engine kept from before that function derives them the same way: `-<revision>` after the format on a dev page). No load path rewrites or relabels a save.
- **Pruning:** a kept revision is deleted once no unfinished shared or private table plays it and it has not been current for 14 days. A private table stops holding its revision when its save records a winner. The 14 days cover guest games, which live in browsers the server cannot see. Finish a guest dev game within that window, at `/galactic-reach/dev/<revision>/`.

Interface edits inside `app.js` reach only tables on the current dev revision. A table on an older dev revision keeps that revision's `app.js`. Keep `index.html` changes additive within a release cycle, because older kept engines still run against it.

`crates/server/src/shared/tests.rs` (`a_dev_table_keeps_its_build_when_a_rules_change_deploys`) covers this: build A deals a table, build B changes rules, the table keeps A's rules and keeps playing, and then an interface-only build B′ reaches both tables. `a_private_dev_table_keeps_its_engine_until_it_finishes` covers private tables: an unfinished one holds its engine past the 14 days, and a finished one releases it. The browser side is in `scripts/test-galactic-reach-dialogs.cjs` (the "private dev table" tests): a table dealt on a dev page reopens from the keys `table.js` seeds, and a table dealt on an earlier revision opens on its kept engine.

## Cut a release

The standing Release PR (`main` → `stable`) always shows what is unreleased. Render previews only PRs into a service's own branch, so the Release PR is the one PR with a Render preview; change PRs into `main` are checked locally (`scripts/dev.sh`) and then on the dev host after merge. Its Render preview, a PR preview of the stable service, runs the batch exactly as it would ship.

The cut PR appears automatically. After every push to `main` that leaves entries in `changes/`, the **Release cut** workflow (`.github/workflows/release-cut.yml`, running `scripts/release-cut.sh`) cuts them on a fresh `release/next` from `main` and opens or updates the single **"Cut: next release"** PR into `main`, labelled `playtest-breaking` or `playtest-safe`. A rules-changing release is named "Playtest <date>" by default. To rename it, edit the `Release name:` line in the PR description; the workflow cuts again with that name. You can also run the workflow from the Actions tab with a name. When the batch is ready:

1. Check that CI passed on the cut PR's head commit, including the [heavy tests](#heavy-tests), review what the cut lists in the PR (rulebook prose, the catalog description), and merge it.
2. Verify the Release PR's preview, announce the reset if rules changed, and merge the Release PR with a **merge commit** (squash or rebase would detach `stable` from `main`).

`release/next` belongs to the workflow: each new `main` commit replaces it, so a fix goes in its own change PR into `main`. Nothing pending is a no-op, and if a cut merges by hand, the workflow closes its stale PR. It never reopens a cut PR someone closed until `main` moves.

The workflow needs no personal token. It runs in one of two setups:

- **Built-in `GITHUB_TOKEN`** (the default). The job asks for contents, pull requests and actions write, which applies even though the repository's default workflow permissions are read-only. Opening the PR needs **Allow GitHub Actions to create and approve pull requests**, which the CardBoardStudio organization controls (Organization settings → Actions → General → Workflow permissions; it is enabled). GitHub starts no workflow for a push made with `GITHUB_TOKEN`, so the cut starts `ci.yml` and `rules.yml` on `release/next` itself with `workflow_dispatch`; their results show on the PR's head commit. The `pull_request`-only step of `rules.yml` (the change-PR policy) is skipped there, which is correct for a `release/*` branch. If GitHub refuses to open the PR, the workflow still pushes `release/next` and puts a compare link and the PR description in the job summary and a warning; open the PR from that link.
- **A GitHub App token** (optional upgrade). Create a GitHub App owned by CardBoardStudio with repository permissions **Contents: read and write** and **Pull requests: read and write**, install it on `drawing_board` only, and add repository secrets `RELEASE_APP_ID` (the App ID) and `RELEASE_APP_PRIVATE_KEY` (a generated private key). When both exist, the workflow uses `actions/create-github-app-token`. The App can open PRs whatever the Actions policy, and its push triggers CI on the cut PR like any other PR, so the `pull_request` checks, including any that branch protection requires, run normally.

To cut by hand (for an edit the cut PR cannot hold):

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
- carries the server's human-turn Undo revision list forward, retaining the outgoing revision for archived tables;
- writes `docs/releases.md` and the game's "New in this playtest" panel from the entries, then deletes the entries.

A batch with only `safe` entries makes no bump. It writes a save-compatible update section, and games in progress continue. `--name` is needed only when rules change. Rerunning `cut` later in the same cycle adds newly merged entries to the same release without bumping again.

Then review what the script lists (rulebook prose, the catalog description), run the checks from [AGENTS.md](../AGENTS.md#verification) plus `node scripts/test-release.cjs`, and open `release/cut` as a PR into `main` labelled with the release's compatibility. Merge it, and the workflow closes its own cut PR.

Either way, the Release PR now contains the bump. Merging it creates a new commit on `stable`. Both CI workflows run on that push so Render's **After CI Checks Pass** setting receives results for the exact commit it will deploy. Once those checks pass, Render deploys `stable`. Verify the successful deployment's game and rulebook before reporting it live.

The release-tooling test builds its own `main` and `stable` branches inside disposable scratch clones. It resets those fixture branches before use, so the complete test also runs when the calling checkout is named `stable` or is a detached release tag. It never resets the caller's branches.

The same check fails a Release PR that still has pending entries: cut them first.

## Heavy tests

Five Rust tests play whole Galactic Reach matches, and the JavaScript balance harness plays 24 more. Together they took most of CI's time, so they no longer run on change PRs. CI runs them as two jobs in `.github/workflows/ci.yml`, **Heavy simulations** (the Rust heavy tier in `.config/nextest.toml`) and **Balance harness**, on:

- the cut PR (`release/next` → `main`), whose CI the Release cut workflow starts with `workflow_dispatch`;
- the standing Release PR (`main` → `stable`), which every merge to `main` synchronizes, so the heavy tests still run after each merge and a regression shows up before it can ship;
- any manual run: Actions → *Rust and container* → *Run workflow*, on any branch.

Change PRs keep fast stand-ins in `crates/server/src/shared/tests.rs`: the first 300 decisions of a four-rival match played twice (`reference_rivals_open_a_match_legally_and_reproducibly`) and resume on the current rules (`shared_tables_resume_exactly_on_current_rules`). They run alongside the archived engine and policy loads.

CI runs Rust tests with [cargo-nextest](https://nexte.st/). `.config/nextest.toml` holds the split: the default profile skips the heavy tier and the `heavy` profile runs only it. Both stop at the first failing test. Locally:

```sh
cargo nextest run --workspace --locked                   # what change PRs run
cargo nextest run --workspace --locked --profile heavy   # the heavy tier
cargo test --workspace --locked                          # everything, without nextest
```

Name a new test `heavy_…` when it plays a whole match or takes more than a few seconds. The three heavy tests in `crates/galactic-reach` keep their old names and are listed by name in both filters of `.config/nextest.toml`, because renaming them would edit a rule-bearing file (the Rules contract check). The dev and test profile builds `galactic-reach` at `opt-level = 1` and dependencies at `opt-level = 2` (`Cargo.toml`), because the rival policy's scoring dominates these tests.

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
5. Let the Release cut workflow open PRs: either allow GitHub Actions to create pull requests (Organization settings → Actions → General → Workflow permissions), or add the GitHub App secrets ([setups](#cut-a-release)).
6. Optionally protect `stable` so only PR merges reach it.

## Dev host

Any Linux machine with Docker, git and systemd can be the dev host. `deploy/dev-host/dev-host.sh` keeps everything under `/opt/drawing-board-dev` (`DEV_HOST_ROOT`): the checkout, a persistent `data/` directory for the dev SQLite database and kept engines, `dev.env` (the server's environment, mode 600), and `dev-host.conf` (`BRANCH`, `PORT`).

The server listens only on `127.0.0.1:<PORT>`. Put an HTTPS tunnel or reverse proxy in front of that port (a Cloudflare Tunnel, Caddy, nginx or `tailscale serve`, for example) and give its public origin to `install` as `APP_ORIGIN`:

```sh
git clone https://github.com/CardBoardStudio/drawing_board.git /tmp/drawing-board
APP_ORIGIN=https://dev.example.com /tmp/drawing-board/deploy/dev-host/dev-host.sh install
# then route https://dev.example.com to http://127.0.0.1:3200
```

`install` refuses an `APP_ORIGIN` that is missing or not `https://`. It creates the directories, writes `dev.env` with `ACCESS=invite-only` ([invite-only hosting](invite-only.md)) and `NIDO_WALLET_HOST=test.nido.fyi` (pass `ACCESS` or `NIDO_WALLET_HOST` to `install` to change either), and enables the `drawing-board-dev-update.timer` systemd timer. Every minute the timer runs `dev-host.sh update`, which fetches `origin/<BRANCH>`. On a new commit it builds the repository's Dockerfile and only then replaces the `drawing-board-dev` container. The container is bound to `127.0.0.1:<PORT>`, mounts the same `data/` directory, and runs with `GALACTIC_REACH_CHANNEL=dev` and `GIT_COMMIT`. A failed build leaves the running server alone. The three newest images are kept for a manual rollback.

- Status: `/opt/drawing-board-dev/bin/dev-host.sh status`. Logs: `journalctl -u drawing-board-dev-update` and `docker logs drawing-board-dev`. `dev-host.sh config` prints the names and paths an instance uses without changing anything.
- Accounts: the dev host admits only Nido accounts that hold an invitation. Make yourself administrator once with `docker exec drawing-board-dev drawing-board grant-admin <your Nido wallet address>`, then invite testers from **Invitations** ([invite-only hosting](invite-only.md)). A host installed before invite-only mode needs `ACCESS=invite-only` added to `dev.env`; its old `ACCOUNT_REGISTRATION_CODE` then has no effect. Do this before the tunnel or proxy makes the host reachable.
- Origin: `APP_ORIGIN` must be the public origin exactly, because Nido sign-in messages name it and the server refuses state-changing requests from any other origin. To change it, see [Changing the origin](#changing-the-origin).
- Backups: `dev-host.sh archive` ([Archiving data](#archiving-data)). Deleting `data/` resets every dev table and account.
- PR mixer: to try open PRs together before they merge, install the [PR mixer](pr-mixer.md) beside the dev host (`deploy/pr-mixer/pr-mixer.sh check`, then `install`, then `sudo tailscale serve --bg --https=3300 http://127.0.0.1:3300`). It is for the dev site's Nido-wallet administrators only, tailnet-only, and gives each mix its own throwaway database; it never touches `data/` or the `drawing-board-dev` container. Status: `deploy/pr-mixer/pr-mixer.sh status`; logs: `journalctl -u drawing-board-pr-mixer`.

`install` copies the script to `<root>/bin/dev-host.sh`, and the timer runs that copy. A later version of the script reaches an installed host only when `install` runs again; rerunning it keeps the existing env file, `dev-host.conf`, checkout and `data/`.

### Stable instance

`DEV_HOST_INSTANCE` selects which copy the script manages. Unset, it is `dev`, with the names above. `DEV_HOST_INSTANCE=stable` runs a second copy, tracking `stable`, on the same machine:

| | `dev` (default) | `stable` |
| --- | --- | --- |
| Branch | `main` | `stable` |
| Root (`DEV_HOST_ROOT`) | `/opt/drawing-board-dev` | `/opt/drawing-board-stable` |
| Port on `127.0.0.1` | 3200 | 3201 |
| Image and container | `drawing-board-dev` | `drawing-board-stable` |
| Env file | `dev.env` | `stable.env` |
| systemd timer and service | `drawing-board-dev-update` | `drawing-board-stable-update` |
| `GALACTIC_REACH_CHANNEL` | `dev` | not set |

Each instance has its own root, so its checkout, `data/`, `dev-host.conf` and update lock are separate too. Installing, updating or archiving one never stops, rebuilds or rewrites the other. The generated service names its instance and root (`DEV_HOST_INSTANCE`, `DEV_HOST_ROOT`), so its timer always updates the right copy.

The server reads `GALACTIC_REACH_CHANNEL` only to switch on the dev channel (`dev`); any other value, or none, deals the released rules (`crates/server/src/shared/channel.rs`). The stable instance leaves it unset, as Render does, so it plays exactly what the Render service plays.

To install it, run the script from any checkout, such as the dev host's own:

```sh
DEV_HOST_INSTANCE=stable APP_ORIGIN=https://play.example.com \
  /opt/drawing-board-dev/repo/deploy/dev-host/dev-host.sh install
# then route https://play.example.com to http://127.0.0.1:3201
docker exec drawing-board-stable drawing-board grant-admin <your Nido wallet address>
```

A new stable instance starts with an empty database: no accounts, invitations or tables. It defaults to `ACCESS=invite-only` and `NIDO_WALLET_HOST=test.nido.fyi`, like dev. Its commands take the same variable: `DEV_HOST_INSTANCE=stable /opt/drawing-board-stable/bin/dev-host.sh status`. An installed copy run without it refuses to act, rather than reaching the dev instance.

One tunnel can serve both: route each hostname to its instance's port. The two timers are independent, so a release that moves `main` and `stable` together builds both images at once.

**The Render service.** `render.yaml` still deploys `stable` to Render (`drawing-board`), and this script does not change it. A self-hosted stable instance is a second, independent deployment of the same branch, with its own origin, database, accounts and invitations; nothing is shared or synchronised between them. Render deploys a `stable` commit only after its CI checks pass (`autoDeployTrigger: checksPass`). The self-hosted instance deploys within a minute of the merge, without waiting for checks.

### Changing the origin

An instance serves one origin at a time. The server accepts state-changing requests only from `APP_ORIGIN`, and Nido sign-in messages name it, so the old origin stops working as soon as the new one takes effect. Changing it:

- **signs everyone out.** Session cookies belong to the old origin.
- **leaves browser-only play behind.** Guest games and anything else a browser saved locally stay under the old origin.
- **keeps the server's data.** Accounts, invitations, shared tables and account-saved private tables stay in `data/`. Accounts are Nido wallets whose passkeys belong to the wallet host (`NIDO_WALLET_HOST`), not to `APP_ORIGIN`, so players sign in again at the new origin with the same wallet.

Docker reads the env file only when it creates the container, so recreate it:

```sh
/opt/drawing-board-dev/repo/deploy/dev-host/dev-host.sh archive
sed -i 's|^APP_ORIGIN=.*|APP_ORIGIN=https://dev.example.com|' /opt/drawing-board-dev/dev.env
docker rm -f drawing-board-dev && /opt/drawing-board-dev/bin/dev-host.sh update
```

Then route the new hostname to the same port and retire the old one.

### Archiving data

`dev-host.sh archive` writes a consistent copy of the instance's `data/` to `<root>/archive/data-<UTC time>/`, for example `/opt/drawing-board-dev/archive/data-20261120T153000Z/`. It stops the container, copies, and starts it again, and the server is down for those seconds. The database runs in WAL mode, so a copy taken while the server writes could catch a half-finished write, and the runtime image has no `sqlite3` for an online backup. Once stopped, the server has closed the database and the files are consistent. The copy runs as root inside the instance's own image, so it keeps `data/`'s owner and mode (the image's `app` user, 700) and needs no `sudo`. It holds the update lock, so the timer cannot replace the container meanwhile; if an update is running, `archive` stops and asks you to retry. A stopped container stays stopped.

`archive` never deletes anything, including earlier archives; remove old ones by hand. To restore one, stop the container, replace `data/` with the archived copy (`sudo cp -a`), and start it.

## Legacy preview identifiers

A cut skips identifiers already owned by published experiment archives. The workstation migration preserves 35.40 and 36.41, so the batch after stable 34.39 uses 37.42. This is one release cut; the old previews keep their engines and manuals. Later entries join that same cut until stable catches up. The next cut after stable 37.42 is 38.43.
