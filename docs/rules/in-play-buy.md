# In-play Buy upgrades and trash (30.35)

**Decision.** The captain decided on 2026-11-14, after a Nido playtest, that cards in play may be upgraded and trashed during your Buy turn. Under 28.33 as published, only hand and discard qualified.

**Rule** ([#buy](../../prototypes/galactic-reach/rulebook.html#buy), [#round](../../prototypes/galactic-reach/rulebook.html#round)):

- **Upgrade starters:** any original starter in your hand, discard or in play can become level II for two of one resource type. It stays where it is; a starter in play still goes to discard at shared cleanup.
- **Decommission:** trash any card that was in your discard **or in play** when your Buy turn began, for three of one resource type. Cards in hand, cards newly gained, cards explicitly discarded this turn, and cards put in play during this Buy (for example a Buy effect just used) are ineligible.
- Cards in play stay outside hand, deck and discard for every other purpose until cleanup.

**Implementation.**

- `upgradeStarter` and `decommission`/`trashEligible` in `prototypes/galactic-reach/app.js`. `startBuyPhase` records the new `buyStartInPlayIds` beside `buyStartDiscardIds`.
- Buy legal actions in `adapter.js`.
- The Market's upgrade and trash lists, and the automatic-Buy choice check (`humanBuyHasChoice`).
- **Rivals use the new options** (captain, 2026-11-14; [#computer-rivals](../../prototypes/galactic-reach/rulebook.html#computer-rivals)). Browser rivals (`runAiBuy`) upgrade starters from hand, discard or play, and pick surplus basic cards to trash from discard or play when Buy began. Native policy **26** (`gr-*/26`) does the same, with the same scoring for discard and in-play cards. The exact published policy 25 from `main` is archived as `crates/galactic-reach/src/legacy_v25.rs` (hash-pinned) for 29.34 matches and replays. The arena pool is `galactic-reach/30.35:…:policies-v26`.

**Versioning.** This changes legal Buy decisions, so it is `playtest-breaking`. While this PR was open, `main` adopted 29.34 Streamlined Operations (#43), so this ruleset is **30.35** and builds on 29.34:
- New games use **save format 30, rules 35** (`galactic-reach/30.35`, "In-play Buy playtest") and `-v30` browser keys.
- The exact published 29.34 browser, manual and engine (from `main` `6222c8a`) are archived as `crates/galactic-reach/rules/v29-*` and served at `/galactic-reach/rules/29.34/`. Their hashes are pinned in `scripts/in-play-buy-archive-hashes.json`.
- 29.34 tables, replays and `with_rules` use that archive. 28.33 keeps the archive #43 created. Old guest saves keep their own keys, and there is no migration.

**Checks.** `scripts/test-in-play.cjs` covers upgrading and trashing an in-play card through the adapter. It also checks that a Buy effect used in the same turn cannot be trashed. `scripts/test-galactic-reach-dialogs.cjs` checks that the Market lists in-play starters and cards as upgradeable and trashable.
