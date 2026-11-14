# In-play Buy upgrades and trash (28.33 amendment)

**Decision.** The captain decided on 2026-11-14, after a Nido playtest, that cards in play may be upgraded and trashed during your Buy turn. Under 28.33 as published, only hand and discard qualified.

**Rule** ([#buy](../../prototypes/galactic-reach/rulebook.html#buy), [#round](../../prototypes/galactic-reach/rulebook.html#round)):

- **Upgrade starters:** any original starter in your hand, discard or in play can become level II for two of one resource type. It stays where it is; a starter in play still goes to discard at shared cleanup.
- **Decommission:** trash any card that was in your discard **or in play** when your Buy turn began, for three of one resource type. Cards in hand, cards newly gained, cards explicitly discarded this turn, and cards put in play during this Buy (for example a Buy effect just used) are ineligible.
- Cards in play stay outside hand, deck and discard for every other purpose until cleanup.

**Implementation.**

- `upgradeStarter` and `decommission`/`trashEligible` in `prototypes/galactic-reach/app.js`. `startBuyPhase` records the new `buyStartInPlayIds` beside `buyStartDiscardIds`.
- Buy legal actions in `adapter.js`.
- The Market's upgrade and trash lists, and the automatic-Buy choice check (`humanBuyHasChoice`).
- Browser rivals (`runAiBuy`) keep their 28.33 choices: they upgrade from hand or discard and trash from discard. The native arena policies choose among the adapter's legal actions, which now include in-play cards.

**Versioning.** This changes legal Buy decisions, so it is `playtest-breaking`. To keep the change focused while a multiplayer branch stacks on it, it amends 28.33 in place on draft PR #42 and does **not** yet bump the version. **Before merge**, it needs the usual cutover:

- bump to save format 29 / rules 34;
- archive the exact 28.33 engine and assets (`crates/galactic-reach/rules/v28-*`, the native-policy module, archive hashes, `table.js` and replay paths);
- keep 28.33 tables and guest saves on their archived engine.

Until then, an older 28.33 table opened on this branch also gets the amended Buy.

**Checks.** `scripts/test-in-play.cjs` covers upgrading and trashing an in-play card through the adapter. It also checks that a Buy effect used in the same turn cannot be trashed. `scripts/test-galactic-reach-dialogs.cjs` checks that the Market lists in-play starters and cards as upgradeable and trashable.
