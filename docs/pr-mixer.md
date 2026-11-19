# PR mixer

The PR mixer is a private page where an authorized tester turns open PRs on and off, presses **Apply**, and plays `main` with exactly those changes. Each combination (a *mix*) is merged, built and served on its own, with its own throwaway database. It is a separate service on its own tailnet-only port, and the dev site itself is unchanged. The default policy requires a Nido administrator; an explicit `tailnet` policy lets connected Tailscale users test without a game administrator account.

Code: `deploy/pr-mixer/`. Tests: `node --test deploy/pr-mixer/pr-mixer.test.mjs`.

## Using it

On `mai`, connect to Tailscale and open the mixer directly on `:3113/__mixer/`; no Nido administrator sign-in is needed. On installations using the default `dev-site` policy, first sign in with Nido as an administrator on the *sign-in server*, then open the mixer on the same host name. See [Hosting options](#hosting-options).

1. The table lists every open PR: title, author, draft, CI state, labels (`playtest-breaking` in red), the base branch when it is not `main`, and the Render preview when one exists (only the Release PR into `stable` has one, [PR previews](pr-previews.md)).
2. Tick PRs, or use a preset: **Main only**, **All ready** (not draft, CI green), **Everything**, or **Alone** on a row (that PR on `main`, the same thing its preview would show). The ticks are remembered in your browser.
3. **Apply** merges the ticked PRs onto the current `main`, in ascending PR number, and builds the result. A repeat of the same PRs at the same heads on the same `main` reuses the earlier build at once.
4. When a mix is built, **Open** it. Every page of the mix carries a purple banner at the bottom naming `main`'s commit and each included PR; **Mixer** in the banner returns here.
5. To sign in inside a mix, use its **sign-in code** from the Mixes table. On the HTTPS host each mix uses preview sign-in ([PR previews](pr-previews.md#identity-and-isolation)): any pilot name plus the code gives a disposable **PREVIEW** identity, so two testers can share a table in the same mix. On a laptop's loopback origin the code is the mix's account enrollment code instead.

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
- **Identity follows the configured policy.** The mixer has no accounts, passwords or login list of its own. The default `dev-site` policy asks the dev site (`GET /api/account` on `127.0.0.1:3200`) about its session cookie and admits only Nido-wallet administrators, caching the answer for a minute. The optional `tailnet` policy uses the identity supplied by Tailscale Serve instead and needs no sign-in server.

If the dev host lacks room, run it on the Mac behind Tailscale instead ([On the Mac](#on-the-mac)). `deploy/pr-mixer/pr-mixer.sh check` decides: at least 4 CPUs, 8 GB memory, 40 GB free for Docker, Node 20+, git 2.38+ and `docker buildx`. A mix build is a full release build (Rust server plus Wasm, roughly as long as a dev-host deploy); one runs at a time and the rest queue.

## Isolation and security

Builds run PR code, so:

- **Who:** `MIXER_AUTH=dev-site` admits only Nido-wallet administrators. `MIXER_AUTH=tailnet` admits any Tailscale user who can reach this host and port under your tailnet access rules; those users can list, apply, stop and delete mixes. It requires a loopback backend and a `https://*.ts.net` origin. Serve supplies `Tailscale-User-Login` and removes client-supplied identity headers; missing or malformed identities are refused. Funnel requests and tagged devices supply no user identity and are refused. The API also refuses cross-origin POSTs. The backend trusts the local Serve proxy, so keep the host's local processes trusted and do not put another proxy in front of it. See [Tailscale Serve identity headers](https://tailscale.com/docs/features/tailscale-serve#identity-headers).
- **Which PRs:** only branches in `CardBoardStudio/drawing_board` itself (their authors already have write access) or PRs by approved authors (`MIXER_APPROVED_AUTHORS`, default `bitswell,maxhays8,willemneal`). Others are listed but cannot be ticked, with the reason.
- **No secrets in builds:** the source is fetched over public HTTPS with no credential helper, exported with `git archive` (no `.git`, no remote), and built with only `PATH`, `HOME` and Docker's own variables in the environment: no `dev.env`, no GitHub token, no `--secret`.
- **Separate build cache:** mixes build on their own BuildKit builder (`pr-mixer`, a `docker-container` builder), so PR code never writes to the cache mounts the dev site's own builds use. The cache is pruned to `MIXER_BUILD_CACHE` (default 30 GB) after each build.
- **Separate data:** each mix runs as container `pr-mix-<key>` from image `pr-mix:<key>` with a fresh Docker volume `pr-mix-<key>` as `/app/data`. It never mounts the dev site's `data/`, so tables, accounts and kept engines in a mix never reach the dev site, and a rules PR can change engines freely. The container drops all capabilities, cannot gain privileges, and is limited by `MIXER_MEMORY` (1g), `MIXER_CPUS` (2) and 512 processes. It is bound to `127.0.0.1` only.
- **Cookies:** every mix is served through the mixer on the mixer's origin. On the way in the proxy forwards only that mix's own cookies (stored as `mx<key>_<name>`) and drops every other, including the sign-in server's session; on the way out it renames the mix's cookies into that namespace. PR code therefore never receives a dev-site session, and a mix never signs you out of the dev site or another mix. Tailscale identity headers are stripped too.
- **Caching:** proxied responses are `no-store`, because every mix serves the same URLs.

Known limits:

- One mix at a time per browser: **Open** sets which mix this browser sees on the mixer's origin. Opening another mix in a second tab switches both tabs; the banner shows which one is current.
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
| `MIXER_AUTH` | `dev-site` | `dev-site` (Nido-wallet administrators), `tailnet` (users identified by Tailscale Serve), or `local` (anyone on a loopback http origin; a laptop only). |
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
MIXER_AUTH=tailnet MIXER_ORIGIN=https://<mac>.<tailnet>.ts.net:3113 MIXER_PORT=3113 \
  MIXER_DATA=~/.local/share/pr-mixer deploy/pr-mixer/pr-mixer.sh run
tailscale serve --bg --https=3113 http://127.0.0.1:3113
```

Open the mixer from a device signed in to Tailscale. No Nido account or game
administrator is needed to use it. The game inside a mix still has its own
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

- **Now: the Mac (`mai`), over Tailscale.** The mixer is on `https://mai.<tailnet>.ts.net:3113/__mixer/` with `MIXER_AUTH=tailnet`; it no longer needs the sign-in server on `:3112`. Nothing is installed on the dev host. It is up only while the Mac is, and builds use the Mac's Docker.
- **Later: beside the dev site on the dev host** ([Install on the dev host](#install-on-the-dev-host)). Admins are then the dev site's own administrators and no separate sign-in server is needed. Run `pr-mixer.sh check` there first for CPU, memory and disk. On credentials: as of 2026-11-17 the repository is public, so listing (public API) and fetching (anonymous HTTPS) need no GitHub credential on the host at all. If it becomes private, the host needs read access without a personal token: a read-only **deploy key** for `git fetch`, plus a fine-grained read-only token for the API, or an **Actions workflow** that builds each mix's image in GitHub and leaves the host only to pull and run images. Decide before installing; the mixer never passes any credential to a build.
