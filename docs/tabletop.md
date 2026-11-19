# Shared board and private phones

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

The host of an existing shared table chooses **Pair public board**, then opens or
copies the one-use link onto the tablet. **Revoke board links** invalidates all
board links and sessions for that table. Older pinned engines without the public
projection explain that a fresh table is needed; they are not upgraded.

A 256-bit random link token travels in the fragment, is removed from browser
history before redemption, and is exchanged once for a separate HttpOnly,
SameSite=Strict cookie. HTTPS adds Secure. The cookie is scoped to that table's
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
- `node scripts/check-tabletop-ui.cjs`: Chromium desktop, tablet orientations and
  phone sizing, keyboard sector inspection and public cards. `SHOTS=path` saves
  screenshots. Browser emulation does not certify physical Android or iOS.

Player-facing rules live only in the [canonical rulebook](../prototypes/galactic-reach/rulebook.html#public-board).
