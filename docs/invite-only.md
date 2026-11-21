# Invite-only hosting

An invite-only server keeps everything behind Nido sign-in and an invitation. It is for a host that faces the public internet, such as the self-hosted dev site. It is off by default. Stable, PR previews, and local development are unchanged unless they set it.

```sh
ACCESS=invite-only   # default: open
```

## Who gets in

A request is admitted when its session belongs to a **Nido account** that either:

- is an administrator, or
- has claimed an invitation that an administrator has not revoked.

Nothing else counts. Recovery-key accounts, development identities and preview identities are refused, even if they are administrators. The captain asked for "credentialed Nido accounts", and a Nido session is re-checked against the wallet's live passkeys at least once a minute, while a recovery key is a bearer secret. On an invite-only host, `/api/accounts/register` and `/api/accounts/login` return 403, and the account page offers only Nido.

The check runs on every request, so a change takes effect on the visitor's next request:

- **Revoking an invitation** removes access from everyone who claimed it. Their accounts and tables remain, so a new invitation restores access. A live table stream that is already open keeps running until it reconnects; the reconnect is refused.
- **Expiry** only limits claiming. Members who claimed an invitation before it expired keep access.
- **Revoking a Nido passkey** signs the session out within a minute.

A sign-in lasts 60 days by default (`SESSION_TTL_DAYS` changes it). Logging out, a revoked invitation, a removed passkey, or **Sign out other sessions** ends it sooner.

## What is public

Without membership, a visitor can reach only:

| Path | Why |
| --- | --- |
| `/`, `/index.html`, `/lab/lab.css`, `/lab/lab.js`, `/lab/replay.js`, `/lab/heirs-emblem.svg`, `/lab/heirs-emblem-round.svg`, `/lab/heirs-emblem-mark.svg`, `/lab/heirs-emblem-favicon.svg` | The landing page, which shows the sign-in and claim steps, and its emblem and favicon |
| `/api/health` | Health checks |
| `/api/session` | Tells the landing page whether this browser is signed in and admitted |
| `/api/auth/nido`, `/api/auth/nido/callback` | The Nido sign-in flow |
| `/api/auth/logout` | Signing out |
| `/api/invites/inspect`, `/api/invites/accept` | Reading and claiming an invitation link; claiming needs a Nido session |

Everything else is refused, including the game pages, rulebooks, game APIs, and table streams. A route added later is refused by default. APIs answer `401` (not signed in) or `403` (signed in, no invitation) with `{"error":…,"access":"invite-required"}`. Pages get a short "Invite required" page with the same status and a link to sign in with Nido or to the start page. Neither contains game data.

## Inviting people

1. An administrator opens **Invitations** in the sidebar and creates a link. It can admit 1–20 people and lasts 1, 7 or 30 days. Copy the link when it appears. It is shown once, and only its hash is stored.
2. The visitor opens the link (`/#invite/<token>`), chooses **Continue with Nido**, approves the sign-in message in Nido, and returns to the link to **Accept invitation**.
3. To remove access, revoke the link in **Invitations**.

**Shared-table links** (`/?game=galactic-reach#lobby/<table>/<invite>`) go through the same steps. A table link seats someone at a table; it does not admit them to the server. A visitor who signs in with only a table link is asked for an invitation. The landing page remembers the table in that browser and returns to it after they accept.

## Admin dashboard

**Members** in the sidebar (administrators only, `GET /api/admin/overview`) is a read-only view of what the server already stores:

- **Totals:** member links created and still active, people accepted out of seats offered, accounts, administrators and accounts with an active session.
- **Invitation links:** every link, including the one-time setup link, with its creator, created and expiry dates, uses accepted out of allowed, status (revoked, else used up, else expired, else active) and each account that claimed it with when.
- **Accounts:** every person's display name, account id (shortened, with a copy button), how they joined (invitation link, administrator setup link, `grant-admin`, direct sign-in on an open host, or a temporary identity), when the account was created, active sessions, last seen, tables they own or sit at, administrator flag, and whether this host currently admits them.

Search, filter and sort happen in the browser. Each list shows the newest 1,000 rows. **Last seen** is the last time the server rechecked one of the account's Nido sessions, at most once a minute while it is in use; the server records no sign-in time, so other sign-in methods show only their session count, and an expired session leaves no trace. The response never includes token or key hashes, recovery keys, Nido public keys or signatures. Creating and revoking links stays on **Invitations**; the dashboard adds no new actions.

## Making the first administrator

Bootstrap from a shell on the host. Do it **before** the host is reachable from the internet.

**Recommended: grant your Nido wallet directly.** No link is ever issued, so there is nothing to intercept.

```sh
drawing-board grant-admin C…YOURNIDOWALLETADDRESS
# Docker dev host:
docker exec drawing-board-dev drawing-board grant-admin C…YOURNIDOWALLETADDRESS
```

Your wallet address is the `C…` contract address shown in your Nido wallet. Then open the site and choose **Continue with Nido**. `grant-admin` can also add more administrators later. It is safe to rerun.

**Alternative: a one-time setup link.**

```sh
docker exec drawing-board-dev drawing-board bootstrap-admin
```

This prints `https://<origin>/#invite/<token>`. Open it, sign in with Nido, and choose **Set up administrator**. The link works once, expires after 24 hours, and grants administrator access to whoever claims it first. It is printed only to your terminal, never logged by the server, and never listed in **Invitations**. After it is claimed, the token is dead and `bootstrap-admin` refuses to issue another, because an administrator exists. Running it again before anyone claims it revokes the earlier link.

## Security on a public origin

- **Origin.** `ACCESS=invite-only` refuses to start unless `APP_ORIGIN` is HTTPS (plain HTTP is allowed only on loopback, for testing) and Nido sign-in is enabled (`NIDO_AUTH` unset or `1`). `APP_ORIGIN` must match the public URL exactly, because Nido sign-in messages name it.
- **Cookies.** Session and sign-in cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` on an HTTPS origin.
- **CSRF.** Every state-changing request must carry the `x-drawing-board: 1` header, which a cross-site form cannot send. It is refused if its `Origin` is not `APP_ORIGIN` or if the browser labels it `Sec-Fetch-Site: cross-site` or `same-site`. These checks apply on every host.
- **Rate limits.** Sign-in, Nido callback, invitation inspect and accept, and recovery-key enrollment and sign-in share a global budget of 120 requests a minute. Behind a proxy that writes the client address, set `TRUSTED_CLIENT_IP_HEADER` (for example `X-Forwarded-For`) to also limit each client to 20 a minute, so one client cannot use up the global budget. The server uses the header's last entry, the one the proxy added. Set it only behind a proxy you control that always writes that header. If the proxy passes a client's header through unchanged, the per-client limit can be dodged, but the global budget still holds.
- **Logs.** The server never logs session tokens, invitation tokens, recovery keys or Nido signatures. Only hashes of tokens and keys are stored.

## Dev host

The self-hosted [dev host](release.md#dev-host) (`deploy/dev-host/`) writes `ACCESS=invite-only` into a new `dev.env` (or `stable.env` for a [stable instance](release.md#stable-instance)). A host installed earlier needs one line added:

```sh
# /opt/drawing-board-dev/dev.env
ACCESS=invite-only
APP_ORIGIN=https://<public origin of the tunnel or proxy>
```

Docker reads `dev.env` only when the container is created, so the change takes effect on the next deploy. To apply it now, remove the container and redeploy the same commit: `docker rm -f drawing-board-dev && /opt/drawing-board-dev/bin/dev-host.sh update`. Check `curl -s http://127.0.0.1:3200/api/session` reports `"invite_only":true`, then make the first administrator as above. Only after that should the host be made public.
