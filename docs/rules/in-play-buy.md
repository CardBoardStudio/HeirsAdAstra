# In-play Buy upgrades and trash (29.34)

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

**Versioning.** This changes legal Buy decisions, so it is `playtest-breaking`. The captain chose to do the cutover on PR #42 now:
- New games use **save format 29, rules 34** (`galactic-reach/29.34`, "In-play Buy playtest") and new browser keys (`galactic-reach-save-v29`, …).
- The exact published 28.33 browser, manual and engine are archived as `crates/galactic-reach/rules/v28-*` and served at `/galactic-reach/rules/28.33/`. Their hashes are pinned in `scripts/in-play-buy-archive-hashes.json`.
- 28.33 tables, replays (`table.js`, `prototypes/lab/replay.js`) and the arena's `with_rules` all use that archive, and old guest saves stay under their v28 keys. There is no migration.
- Native policy 24 is unchanged and shared by both rule sets. It never chooses the new in-play options, so its 28.33 behaviour is identical. The arena pool moves to `galactic-reach/29.34:…:policies-v24`.

**Checks.** `scripts/test-in-play.cjs` covers upgrading and trashing an in-play card through the adapter. It also checks that a Buy effect used in the same turn cannot be trashed, verifies the archive hashes, and confirms that the archived 28.33 engine still refuses in-play upgrades and trashes. `scripts/test-galactic-reach-dialogs.cjs` checks that the Market lists in-play starters and cards as upgradeable and trashable.
