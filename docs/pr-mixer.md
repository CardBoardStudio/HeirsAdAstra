# PR mixer

The private **Playtests** launcher builds selected PRs on `main`, with a separate
container and database for each combination. Players never need to visit it.
Code: `deploy/pr-mixer/`. Tests: `node --test deploy/pr-mixer/pr-mixer.test.mjs`.

## Using it

1. An operator opens `/__mixer/`. The latest ready playtest and **Open playtest**
   are the primary view. **Choose changes** contains the PR list and **Build
   selection**. Previous builds, logs, manual sign-in details and maintenance
   live under **Previous playtests & details**.
2. **Open playtest** reuses the operator's existing game session. On HTTPS, if
   signed out, the launcher exchanges the preview code on the server and gives
   the browser only the namespaced session cookie. No code copying is needed.
   Loopback installations retain their existing account-enrollment flow.
3. Create or reopen a table inside the game. Share the game's invitation with
   players. The invitation identifies the table; a guest never selects a build,
   enters a preview code or receives playtest-management permission.
4. Build new changes when needed. A new ready build is offered for opening, but
   existing tables remain on their original build. A build in progress leaves
   the last ready playtest available.

## Player routing and recovery

All proxied game HTML is unchanged: no developer banner, build metadata or mixer
link is injected, including on the organizer's game screen. Game connection
failures render a game-branded retry screen (or JSON error for APIs), never a
redirect to the launcher. Detailed startup diagnostics stay in operator logs.

The mixer persists a table-to-build destination after a successful host-owned
lobby read or link issuance. Bootstrap pages, scoped player assets, API commands
and event streams use this destination even if another tab changes the global
playtest selection. Bootstrap CSS/JS uses the same-origin document referrer;
non-table pages such as the manual use a fallback selection cookie. A route
survives restarts and stopped containers and lasts until its build is deleted.
Old route timestamps are retained as metadata, not treated as authorization or
expiry. Missing or ambiguous routes fail closed with a request for a fresh
invitation; a browser cookie cannot resolve a table cloned into two builds.
After upgrading an older installation, open Table setup or reissue its invitation
to establish any missing route. Pairing secrets stay in URL fragments; the mixer
never reads or stores them. The game still validates the table/role credential on
every protected request. Routing itself grants no access.

If a PR does not merge cleanly, nothing is built and the page says why, per PR:

- *conflicts with main itself*: the PR needs a rebase; it cannot be in any mix until then.
- *conflicts with #N*: these two PRs touch the same lines. **Drop #N** or **Drop** the other one, and the page applies again.
- *conflicts only with the combination*: no single earlier PR clashes, but the PRs before it together do. Drop one of them.

Each message lists the conflicting files. A PR whose base is another PR's branch (a stacked PR) brings that branch's commits too.

## Where it runs, and why it is a separate service

The mixer runs **beside the dev host on the same Linux machine** (the bitswell home server), as its own systemd service, not inside the game server:

- **Builds need Docker.** Giving the dev site's container the Docker socket would give it root on the host. The mixer runs on the host as the same user as `dev-host.sh`.
- **It must survive a broken `main`.** If a merge breaks the dev server, the mixer still lists PRs and builds fixes.
- **Access stays private.** It has its own port (3300), published only on the tailnet; the dev site and stable site get no new route, page or link.
- **Identity follows the configured policy.** The mixer has no accounts, passwords or login list of its own. The default `dev-site` policy asks the dev site (`GET /api/account` on `127.0.0.1:3200`) about its session cookie and admits only Nido-wallet administrators, caching the answer for a minute. The optional `tailnet` policy uses the identity supplied by Tailscale Serve, with explicit operator logins in `MIXER_MANAGERS`, and needs no sign-in server.

If the dev host lacks room, run it on the Mac behind Tailscale instead ([On the Mac](#on-the-mac)). `deploy/pr-mixer/pr-mixer.sh check` decides: at least 4 CPUs, 8 GB memory, 40 GB free for Docker, Node 20+, git 2.38+ and `docker buildx`. A mix build is a full release build (Rust server plus Wasm, roughly as long as a dev-host deploy); one runs at a time and the rest queue.

## Isolation and security

Builds run PR code, so:

- **Who:** `MIXER_AUTH=dev-site` permits Nido-wallet administrators to manage
  playtests. `MIXER_AUTH=tailnet` permits identified Tailscale users to play, but
  only exact, case-insensitive logins in `MIXER_MANAGERS` can list, build, launch,
  stop or delete playtests. Its default is empty (management denied). Set this
  explicitly when upgrading; there is no automatic promotion of visitors.
  A paired player credential never authorizes management. A person already
  configured as an operator can still visit the launcher deliberately. No game
  administrator account is needed with the tailnet policy.
- **Network:** tailnet mode requires a loopback backend and HTTPS `*.ts.net`
  origin. Serve supplies `Tailscale-User-Login`; missing/malformed identities,
  Funnel and tagged devices are refused. Keep the local Serve proxy trusted.
  With `dev-site`, delegated game routes rely on the game's existing capability
  and membership checks; the management routes still require administrator
  authentication. The management API refuses cross-origin POSTs.
- **Which PRs:** only branches in `CardBoardStudio/drawing_board` itself (their authors already have write access) or PRs by approved authors (`MIXER_APPROVED_AUTHORS`, default `bitswell,maxhays8,willemneal`). Others are listed but cannot be ticked, with the reason.
- **No secrets in builds:** the source is fetched over public HTTPS with no credential helper, exported with `git archive` (no `.git`, no remote), and built with only `PATH`, `HOME` and Docker's own variables in the environment: no `dev.env`, no GitHub token, no `--secret`.
- **Separate build cache:** mixes build on their own BuildKit builder (`pr-mixer`, a `docker-container` builder), so PR code never writes to the cache mounts the dev site's own builds use. The cache is pruned to `MIXER_BUILD_CACHE` (default 30 GB) after each build.
- **Separate data:** each mix runs as container `pr-mix-<key>` from image `pr-mix:<key>` with a fresh Docker volume `pr-mix-<key>` as `/app/data`. It never mounts the dev site's `data/`, so tables, accounts and kept engines in a mix never reach the dev site, and a rules PR can change engines freely. The container drops all capabilities, cannot gain privileges, and is limited by `MIXER_MEMORY` (1g), `MIXER_CPUS` (2) and 512 processes. It is bound to `127.0.0.1` only.
- **Cookies:** every mix is served through the mixer on the mixer's origin. On the way in the proxy forwards only that mix's own cookies (stored as `mx<key>_<name>`) and drops every other, including the sign-in server's session; on the way out it renames the mix's cookies into that namespace. PR code therefore never receives a dev-site session, and a mix never signs you out of the dev site or another mix. Tailscale identity headers are stripped too.
- **Caching:** proxied responses are `no-store`, because every mix serves the same URLs.

Known limits:

- Non-table browsing (the home screen and solo play) still uses one selection per browser. Table-scoped game requests remain pinned across tabs. Static reference pages use the fallback selection.
- Solo saves in browser storage belong to the mixer's origin, so all mixes share them (never the dev site's, which is another origin). Shared tables are on the server and stay per mix.
- A mix container can reach the internet (Nido sign-in and the wallet need it).

## Cache keys and cleanup

A mix's key is the first 12 hex digits of SHA-256 over `main`'s commit and each PR's number and head commit, sorted. A new push to any included PR, or a new `main`, makes a new mix; the old one stays until cleaned up. The merge commits use fixed dates, so the same inputs give byte-identical source.

- A mix idle for `MIXER_IDLE_HOURS` (6) is stopped; opening it starts it again with its tables intact.
- At most `MIXER_MAX_RUNNING` (3) mixes run; starting another stops the least recently used.
- At most `MIXER_MAX_KEPT` (8) mixes are kept; beyond that the least recently used is deleted with its image, volume and build log.
- **Delete** removes a mix and its tables immediately.

## Install on the dev host

On the dev host, after the [dev host](release.md#dev-host) itself, as the same sudoer user:

```sh
cd /opt/drawing-board-dev/repo                     # the dev host's checkout of main
deploy/pr-mixer/pr-mixer.sh check
MIXER_ORIGIN=https://<host>.<tailnet>.ts.net:3300 deploy/pr-mixer/pr-mixer.sh install
sudo tailscale serve --bg --https=3300 http://127.0.0.1:3300   # tailnet only; never Funnel
```

`install` copies the app to `/opt/drawing-board-dev/mixer/app`, writes `mixer.env` (mode 600), creates the `pr-mixer` builder and enables `drawing-board-pr-mixer.service`. Rerun `install` after pulling a newer mixer; it keeps `mixer.env`. Status: `deploy/pr-mixer/pr-mixer.sh status`. Logs: `journalctl -u drawing-board-pr-mixer`. Applies are logged with the admin's name.

Sign in to the dev site at `https://<host>.<tailnet>.ts.net:3200/` (the same host name as the mixer). If you normally use the dev site's public origin, that is another host name, so its session does not reach the mixer.

### Settings (`mixer.env`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `MIXER_ORIGIN` | `http://127.0.0.1:3300` | The exact origin browsers use. HTTPS turns on preview sign-in in mixes. |
| `MIXER_AUTH` | `dev-site` | `dev-site` (Nido-wallet administrators), `tailnet` (players identified by Serve; management requires `MIXER_MANAGERS`), or `local` (anyone on a loopback http origin; a laptop only). |
| `MIXER_MANAGERS` | empty | Comma-separated Tailscale login names allowed to manage builds in tailnet mode. Empty denies management; game invitations still work. |
| `DEV_SITE_URL` | `http://127.0.0.1:3200` | Where the mixer asks the sign-in server about a session. |
| `DEV_SITE_PUBLIC_URL` | `https://<mixer host>:3200/` | The sign-in server's address on the mixer's host name, linked from the "administrators only" page. |
| `MIXER_APPROVED_AUTHORS` | `bitswell,maxhays8,willemneal` | Fork authors whose PRs may be built. |
| `MIXER_PORT`, `MIXER_PORT_RANGE` | `3300`, `3400-3449` | The mixer's port and the loopback ports for mix containers. |
| `MIXER_MAX_RUNNING`, `MIXER_MAX_KEPT`, `MIXER_IDLE_HOURS` | `3`, `8`, `6` | Cleanup, above. |
| `MIXER_MEMORY`, `MIXER_CPUS`, `MIXER_BUILD_MINUTES`, `MIXER_BUILD_CACHE` | `1g`, `2`, `60`, `30gb` | Per-mix limits, build timeout and build cache cap. |
| `MIXER_BUILDER` | `pr-mixer` | The BuildKit builder; empty uses Docker's default (shares the dev build cache, so avoid it). |
| `GITHUB_TOKEN_FILE` | | Optional token for the GitHub API. See below. |

The mixer binds only to `127.0.0.1` (it refuses anything else): `tailscale serve` is the way in, and a wider bind would let mix containers reach it.

### GitHub access

Listing needs no credential: the repository is public, and the mixer reads it through the public API (60 requests an hour for the host). Every response is cached by ETag, and a `304 Not Modified` does not count against that limit, so a refresh costs little once the list is warm. If the limit is still reached, the page keeps the last list and says when it resets. A fine-grained, read-only token (Pull requests and Commit statuses: read, on this repository only) in a mode-600 file named by `GITHUB_TOKEN_FILE` raises the limit. Ask before putting any credential on the host. The token is used only for API reads, never for `git` or a build.

## On the Mac

For a private host such as `mai`, use Tailscale identity directly:

```sh
MIXER_AUTH=tailnet MIXER_MANAGERS=you@example.com MIXER_ORIGIN=https://<mac>.<tailnet>.ts.net:3113 MIXER_PORT=3113 \
  MIXER_DATA=~/.local/share/pr-mixer deploy/pr-mixer/pr-mixer.sh run
tailscale serve --bg --https=3113 http://127.0.0.1:3113
```

Open the launcher from a device signed in to Tailscale as a configured operator.
Other connected users can follow game invitations, but cannot manage builds.
No Nido account or game administrator is needed. The game inside a mix still has its own
player identity and phone-pairing rules. Keep an existing installation's
`MIXER_DATA` path when changing modes so its mixes remain available.

The following alternative keeps the default Nido administrator policy:

The same service runs on a Mac with Docker (OrbStack or Docker Desktop), Node 20+ and Tailscale. There is no dev site on the Mac, so `pr-mixer.sh gate` runs one to sign in to: `main` in Docker as container `pr-mixer-gate`, invite-only (Nido accounts only), with its own volume, and the given wallet as its administrator. Rerun it to move it to the newest `main`, add another administrator, or change `NIDO_WALLET_HOST` (default `test.nido.fyi`; use the wallet host your passkey was created on, [Nido authentication](nido-auth.md#host-setup)); accounts and sessions persist in the volume.

```sh
deploy/pr-mixer/pr-mixer.sh check
H=https://<mac>.<tailnet>.ts.net
GATE_ORIGIN=$H:3112 deploy/pr-mixer/pr-mixer.sh gate C…YOURNIDOWALLETADDRESS
tailscale serve --bg --https=3112 http://127.0.0.1:3112
MIXER_ORIGIN=$H:3113 MIXER_PORT=3113 DEV_SITE_URL=http://127.0.0.1:3112 DEV_SITE_PUBLIC_URL=$H:3112/ \
  MIXER_DATA=~/.local/share/pr-mixer deploy/pr-mixer/pr-mixer.sh run
tailscale serve --bg --https=3113 http://127.0.0.1:3113
```

Open `$H:3112`, choose **Continue with Nido** and approve with your wallet's passkey, then open `$H:3113/__mixer/`. Both are tailnet-only (`serve`, never Funnel). Builds are much faster on a recent Mac, but the mixer is only up while the Mac and the `run` process are.

For just you on this Mac, `MIXER_AUTH=local deploy/pr-mixer/pr-mixer.sh run` and `http://127.0.0.1:3300/__mixer/` skip the sign-in server. `local` admits anyone who can reach the port, so it requires a loopback `http` origin; mixes then run on that origin with the sign-in code as their enrollment code.

## Hosting options

- **Now: the Mac (`mai`), over Tailscale.** The mixer is on `https://mai.<tailnet>.ts.net:3113/__mixer/` with `MIXER_AUTH=tailnet` and an explicit `MIXER_MANAGERS` list; it does not need the sign-in server on `:3112`. Nothing is installed on the dev host. It is up only while the Mac is, and builds use the Mac's Docker.
- **Later: beside the dev site on the dev host** ([Install on the dev host](#install-on-the-dev-host)). Admins are then the dev site's own administrators and no separate sign-in server is needed. Run `pr-mixer.sh check` there first for CPU, memory and disk. On credentials: as of 2026-11-17 the repository is public, so listing (public API) and fetching (anonymous HTTPS) need no GitHub credential on the host at all. If it becomes private, the host needs read access without a personal token: a read-only **deploy key** for `git fetch`, plus a fine-grained read-only token for the API, or an **Actions workflow** that builds each mix's image in GitHub and leaves the host only to pull and run images. Decide before installing; the mixer never passes any credential to a build.
