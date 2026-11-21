# Tables, personal players and optional public displays

The [prototype epic](https://github.com/CardBoardStudio/drawing_board/issues/121)
adds an online browser experience for an Android tablet and iPhone Safari. The
server remains the rules, shuffle, AI and save authority. This is not offline or
trustless play. Rust portability, P2P and ZK are separate follow-up issues.

## Public board boundary

`adapter.publicState()` explicitly lists public information. It never clones a
player's view or the full state. Terrain is public; moons appear only once
surveyed publicly. A relic signal appears only if every faction knows it. The
board receives counts, not hand/deck contents, and combat uses the nonparticipant
projection. Finishing a game does not expand board access. Raw table events and
full replay reports are not board APIs.

The organizer chooses **Play on this device** or **Use as shared board** once.
Personal play opens the invitation lobby. A shared board first shows **Connect
your phone** for the organizer’s existing seat, then changes to **Invite players**
after that phone redeems its link. The choice is a per-table sessionStorage
preference, not a game rule or an inference from viewport size. Host setup remains
accessible for management; starting navigates to the selected game/display. Guest players can use phones,
desktops or personal tablets. Their complete game already adapts to the viewport;
further layout controls are tracked in #155.

**Show public board here** opens a public display, or **Add a shared display** shares
a QR/link with a separate screen, before or after Start. Waiting displays contain
only the table name and waiting status. No display connection is required to start
or continue. The server remains the authority when all screens close.

The host of an existing shared table may also choose **Pair public board**, then
open or copy the one-use link onto another screen. **Revoke board links** invalidates all
board links and sessions for that table. Older pinned engines without the public
projection explain that a fresh table is needed; they are not upgraded.

A 256-bit random link token travels in the fragment, is removed from browser
history before redemption, and is exchanged once for a separate HttpOnly,
SameSite=Strict cookie. Public displays use a separate board cookie so opening a
board does not overwrite a private player session in another tab. Existing board
cookies remain readable until expiry or revocation. HTTPS adds Secure. The cookie is scoped to that table's
API path; storage contains only SHA-256 verifiers. Links expire after 24 hours;
device sessions expire after 30 days. Host revocation applies to both.

Only exact bootstrap assets and exact scoped API paths bypass the normal
invite-only gate. Every API validates table and role. Host operations keep the
normal membership gate. Device grants never create a general account session or
make a guest a site member. CSRF and origin checks still apply. SSE checks the
capability on every update and quiet heartbeat; the client resynchronizes after
network or visibility changes. No credential is placed in a request URL.

## Verification

- `node scripts/test-shared-tables.cjs`: hidden-card, relic, combat and public DTO checks.
- `cargo test -p server tabletop`: role/table scope, expiration, revocation,
  invite-only boundaries and restored public views.
- `TABLETOP_ORIGIN=http://127.0.0.1:PORT node scripts/check-tabletop-roles.cjs`:
  real create/setup flow, guest approval, a waiting display, personal tablet/phone,
  independent cookies, display revocation followed by play, reload and anonymous
  rules. Runs in CI against an isolated DEV_AUTH server. `SHOTS=path` saves captures.
- `node scripts/check-tabletop-ui.cjs`: Chromium desktop, tablet orientations and
  phone sizing, keyboard sector inspection and public cards. `SHOTS=path` saves
  screenshots. Browser emulation does not certify physical Android or iOS.

Player-facing rules live only in the [canonical rulebook](../prototypes/galactic-reach/rulebook.html#public-board).

## Guest phone pairing

New shared tables open **Table setup** directly. An existing account-owned
waiting room also links there. The organizer still owns a player seat, independent
of which device shows the public board; this does not add a nonplaying organizer
seat. **Play here** requires the signed-in owner and issues or reuses a scoped
player session without revoking a paired device. Explicit replacement still
revokes old player grants. Other host operations keep the account membership gate. Guests scan a
room QR or follow its link, choose a local name and choose **Join game**. Their room name is shown after a POST with the
invitation token validates it; only the room name is returned, without a roster,
account identity or new credential. The token never enters a request URL.
Match the
six-character pairing code before approving. QR encoding uses the local
[`qrcode` SVG renderer](https://docs.rs/qrcode/0.14.1/qrcode/render/svg/); no
external QR service sees the link. The text link is the manual fallback.

Approved phones automatically open their pinned player client when Start completes.
Returning paired devices resume their existing seat rather than joining again.
Pending and ready screens explain what the host must do next. Network failures
retry in place; invalid/revoked invitations explain that the host must reconnect
the device. Replacement and public-display revocation require explicit confirmation
in **Table settings & devices**. The host-only requests response includes whether
the host seat has a redeemed player session; it exposes no token.

A guest has an internal participant row without a login credential. Its pending
cookie gains the player role only after host approval. It cannot authenticate to
ordinary account, shared, admin or arena endpoints. The host can replace a lost
phone's grant, invalidating every old grant for that participant while preserving
the seat. Guests cannot approve themselves or another phone. Pending requests
are bounded; room invitations expire after 24 hours and rotate when reissued.

Starting a paired table requires two to four humans. A transaction freezes the
approved roster and random seat assignment before the engine starts. Retries
use that saved deal. An approval racing Start either enters the frozen roster or
is refused; an unapproved phone cannot join a game already in progress. Existing
account-only waiting rooms retain their existing start path.

Player commands and streams resolve the participant from the cookie, not from a
submitted seat number. The game bundle is served beneath the table cookie path,
with role validation on every asset and the table's pinned engine. The ordinary
`/galactic-reach/` access gate stays intact. The independent ZK Testnet demo does
not load in guest play. `shared.js` handles either account or scoped phone APIs.

`TABLETOP_ORIGIN=http://127.0.0.1:PORT node scripts/check-tabletop-flow.cjs`
exercises the real local DEV_AUTH server: scan/link entry, request, approval,
private game loading, phone/tablet viewports, reload and a separate public board.
Run the web build and server first. The test rejects non-loopback targets.

## Private interaction

The scoped phone UI wraps outgoing choices in a local confirmation dialog. It
captures the current authority sequence, sends nothing while previewing, and
disables Confirm if a newer position arrives. Confirmation sends the original
choice at the current sequence; the existing authority still validates legality.
Off-turn resource conversion remains legal and uses the same confirmation.

The private reminder stores a card and sector only in the current page. It
survives live updates but never executes, schedules a command, or sends the plan
to another device. A reminder whose card left the hand says so. Map actions reuse
the existing engine controls; disabled costs name the missing resources.

A tablet tap can send only a coordinate and observed sequence. The server checks
the map boundary and board role, keeps at most 256 ephemeral suggestions for two
minutes, and discards a suggestion when the game sequence changes. Only the
acting phone receives it. Inspection never invokes the engine's action-taking
map click path, and an existing private selection is left for the player to
finish or cancel. Suggestions are absent from saves, hashes and game reports.
