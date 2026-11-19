# Playtest roadmap

## Current GitHub merge

All 19 original workstation PRs (#21–#36, #39, #52 and #54), plus integration PRs #56 and #61, are merged into main. [PR #61](https://github.com/CardBoardStudio/drawing_board/pull/61) produced `45b3a4057e879c65ec77eed2b5e2ce349445e1cc`. Its tree exactly matches the locally tested clean combination with the latest main access controls. All required PR checks passed, including Rust/Wasm, JavaScript, rules/release policy and container HTTP smoke. The local main reference was fast-forwarded; the original working checkout and its edits were preserved.

Main now follows the dev/stable release process adopted independently in PR #55. The game batch is cut as 37.42 with complete 34.39, 35.40 and 36.41 archives. Stable promotion is the separate [Release PR #59](https://github.com/CardBoardStudio/drawing_board/pull/59). A later invite-gate entry from the other workstation remains pending for that release process; it is not a remaining workstation game modification.

## Pending changes

- After capturing a Colony, allow its new owner to build over enemy Harvesters on that world. Requested; not yet implemented.

## Implemented: Trash, combat and Buy refinements

- The Trash pile shows that trashing a card costs 3 of one resource.
- In fights, Fleets take damage before Settlers.
- Held 2:1 exchange cards can be played during the owner's Buy phase without ending Buy.

Merged in [PR #138](https://github.com/CardBoardStudio/drawing_board/pull/138) as `41df2dd53088a3854c5fae59c8e930daf03be1c3`. All PR checks passed. The healthy dev host serves this commit as `38.43+dev.8`; stable promotion remains separate.

Developer queue, portal and feedback work are included in the merged batch. Other-workstation PRs are outside this list.

## Tabletop interface review preview in 27.32

- Shared faction standings, turn information, the galaxy key and scoring reference sit inside reserved board corners. Comms Feed stays below scoring. Hexes remain unobstructed.
- Warm paper cards and the personal player mat group hand, reserves and card piles. The full private game-report download stays on the player mat. Map-order and Buy navigation, zoom, private discovery, reports and replays remain.
- Desktop-only UI scope is saved in AGENTS.md. Accessibility work covers keyboard, names, focus and contrast at desktop window sizes.

Status: [PR #38](https://github.com/CardBoardStudio/drawing_board/pull/38) was merged with user authorization as 22bc38900914f62d07c99b1ed9829f569359ae7f. Stable Render deployment 7782336445 successfully serves the [live 27.32 game](https://drawing-board-p0g3.onrender.com/galactic-reach/) and [canonical rulebook](https://drawing-board-p0g3.onrender.com/galactic-reach/rulebook.html#shared-board). All post-merge CI checks passed. Anonymous live assets, health/version, preserved 6.11/7.12 bundles, game-to-rules links and desktop browser rendering were verified. New stable games use 27.32; old guest keys and pinned engines remain separate. Desktop-only UI preference remains in AGENTS.md.

## Implemented: victory wording in 27.32

- Human victories say “You win”; named rival factions keep “wins.” The live victory dialog and replay results share this wording.

Status: published on [PR #37](https://github.com/CardBoardStudio/drawing_board/pull/37). The successful Render deployment for 7896bb1 serves the [27.32 game](https://drawing-board-pr-37.onrender.com/galactic-reach/) and [canonical rules](https://drawing-board-pr-37.onrender.com/galactic-reach/rulebook.html#victory). Anonymous assets match source; live and replay winner wording, game-to-rules navigation and the narrow rulebook layout were checked. All JavaScript, rules, Rust/Wasm and production-container smoke checks passed. Rules and saved games remain 27.32. No merge into main.

## Implemented in the 27.32 Cards in Play experiment

- Used orders, conversions, Buy effects and reactions stay in play until shared round cleanup. Draws and discard recovery cannot recycle them earlier. Explicit discard/return effects, newly gained-card discard and single-use trash effects keep their stated destinations.
- Click In play to inspect used cards. The zone persists in saves, Undo, exports and replays. New games use 27.32; 26.31 games retain their archived rules.

Status: published on [PR #37](https://github.com/CardBoardStudio/drawing_board/pull/37). The [27.32 game](https://drawing-board-pr-37.onrender.com/galactic-reach/) and [canonical rules](https://drawing-board-pr-37.onrender.com/galactic-reach/rulebook.html#round) were verified on the successful deployment for 6e24b07. All JavaScript, Rust/Wasm, rules and production-container smoke checks passed. No merge into main.

## Implemented in the 26.31 Ship Count update

- Mixed ship types keep their complete counts beneath each icon, inside the hex, with separate room for buildings. Small screens use a readable, pannable board. Zoom and Sector Scan remain available.
- Reran the current browser rivals under 26.31 with single-use Probe/Colonize and the ten-Fleet cap: 2,592 completed trials, matched 25.30 controls, four-seat rotations, randomized setups and resource-gift checks. See the local single-use-orders-26.31-results report.

Status: published on [PR #36](https://github.com/CardBoardStudio/drawing_board/pull/36), with the [updated game](https://drawing-board-pr-36.onrender.com/galactic-reach/) and [canonical rules](https://drawing-board-pr-36.onrender.com/galactic-reach/rulebook.html) verified on the successful deployment for 80a63af. Gameplay and save format remain 26.31. No merge into main was performed. All JavaScript, rules, Rust/Wasm and container smoke checks passed.

## Implemented in the 23.28 Twenty Point Strategy experiment

- Victory at 20 Prestige; Colonies score 3 each without a pair bonus, excavated relics 2 each, and qualifying decisive combat wins 1 each.
- Paid storage upgrades add 5 capacity for 1 of every resource, then 2 each, 3 each, and so on. Each faction counts its own paid purchases; free relic storage does not advance the price.
- Improve public threat awareness, Settler safety and escorts, Fleet regrouping, early production and starter upgrades using the supplied human report. Matched strategy and resource trials accompany this experiment.

Status: published and verified on [PR #32](https://github.com/CardBoardStudio/drawing_board/pull/32), without merging main. Start a new game on the [23.28 playtest](https://drawing-board-pr-32.onrender.com/galactic-reach/); its [canonical rules](https://drawing-board-pr-32.onrender.com/galactic-reach/rulebook.html) ship on the same origin. The current requested modification list is implemented.

## Implemented in the 22.27 Probe Relics experiment

- Require Probe to privately locate a relic with an Explorer on that world or moon. Explorer commissions grant Probe and Excavate to discard. Arrival reveals terrain only.
- Bank exchange uses four Give buttons and four Receive buttons, followed by Convert.

Status: published in PR #31 and included in 23.28. Older tables retain their discovery rules.

## Implemented in the 21.26 Scoring Bots experiment

- Improve rivals’ ability to earn Prestige through Colonies, relics and favorable combat; coordinate units and preserve useful orders/resources.
- Rerun matched strategy and resource simulations against the exact 20.25 baseline, including head-to-head checks.

Status: published in 21.26. Existing20.25 games keep their archived rivals.

## Implemented in the 20.25 Open Worlds experiment

- Keep all planets visible to all players at all times, with resources, ownership, and buildings public. Hide only undiscovered moons and unlocated relic sites on the map. Keep private relic signals distinct from public surveys.
- Randomize the four moons while keeping them widely spaced, fairly distributed across the map, and at comparable travel distances from each home. Preserve the approved thirteen-world layout.

Status: implemented; new-game experiment preserves 19.24 tables and reports.

## Implemented in the 19.24 Game Reports experiment

- **Export game report:** add a visible button to download a JSON report containing the current saved position, rules version, round/phase, factions and bot profiles, scores and scoring breakdowns, resources, and the available game log. Include readable log text so a completed human-versus-bot game can be reviewed alongside its final position.
- **Full game logging:** retain the complete history from setup through victory for new games, covering every faction's turns, actions and outcomes. Identify the round, phase and acting faction; include resource changes, conversions, construction, movement, colonization, excavation, trades, purchases, combat outcomes and Prestige awards. Preserve the history across reloads and record undo boundaries. The visible Comms Feed can remain compact while the exported history stays complete.
- **History completeness:** existing saves export their retained events and clearly mark earlier history as incomplete. Full recording begins with new games; starting another game starts a separate history.
- **Clickable point totals:** click a faction's point total to see its Prestige breakdown by scoring source.
- **Remove Shipyard points:** Shipyards no longer grant Prestige, including the current point per pair.
- **Remove card points:** purchased cards no longer grant Prestige, including the current point per eight lifetime purchases.

Status: implemented in 19.24. Start a new game for the revised scoring and complete history. Earlier tables keep their archived rules.

## Historical planning

Historical planning snapshot: PR #5 was adopted and Long Reach 6.11 reached `main` in PR #16. Use the [current workflow](playtest-workflow.md) for new branches and the [canonical rules maintenance guide](rules/README.md) for rules changes. The statuses and numbered follow-ups below describe the earlier planning stage.

This repository has three related pull requests with deliberately different jobs:

| Pull request | Lane | Purpose | State |
| --- | --- | --- | --- |
| [#3](https://github.com/CardBoardStudio/drawing_board/pull/3) | Stable prototype | Galactic Reach browser game, local rivals, board rules, and guest saves | Merged to `main` |
| [#4](https://github.com/CardBoardStudio/drawing_board/pull/4) | Platform foundation | Shared library, accounts, invitations, saved tables, two game adapters, AI arena, and owner-scoped Elo | Merged into the stable lane |
| [#5](https://github.com/CardBoardStudio/drawing_board/pull/5) | Breaking experiment | Galactic Reach 6.11 rules, pinned table versions, placement Elo, calibration, ranked games, and step-through replays | Adoption candidate |

PR #5 targets the stable lane after #4. It is an integration experiment because the new rules, table versioning, arena pool, and replay browser need the account and arena foundation together. The work inside #5 is organized into four review slices:

1. **Rules and player experience** — the larger randomized map, 20-Prestige target, movement minimums, upgraded starter orders, open offers, larger resource/key UI, direct card orders, and hex-anchored Sector Scan.
2. **Versioned saved tables** — `galactic-reach/6.11` uses save format 6 and rules revision 11. Existing 4.9 and 5.10 tables retain their engines and open from archived asset bundles. A table displays its pinned version and rejects a cross-version save.
3. **Arena calibration and placement Elo** — four version-3 policies run authoritative 20-game calibrations. Final standings use Prestige, colonies, and stored resources; pairwise Elo therefore reflects second, third, and fourth place as well as first.
4. **Interestingness and replay** — completed AI games are ranked by lead changes, battles, and finish closeness. The replay view exposes the board, resources, hands, log, action frames, round jumps, autoplay, and final Elo changes. Replays are owner-scoped and verified against the recorded result before caching.

## Proposed follow-up PRs

These are the next logical changes after the PR #5 playtest. Each should remain small enough to review and should target the branch that has actually been adopted.

### PR 6 — 6.11 playtest fixes

Base this on the tested PR #5 commit. Include only bugs, accessibility fixes, copy, layout, and replay navigation issues found during playtest. Keep the 6.11 rules and save meaning unchanged, and use the `playtest-safe` label.

### PR 7 — promote the accepted ruleset

If the playtest is accepted, rebase the experiment on the latest platform foundation, announce the save cutover, and promote 6.11 to the stable Galactic Reach lane. Verify the new stable deployment before asking players to start fresh tables. If the rules are rejected, close #5 and leave the stable 5.10 lane untouched.

### PR 8 — calibrated AI opponents in human tables

Let a table owner choose one of their calibrated AI accounts as a Galactic Reach opponent. Reuse the existing `PlayerAgent` contract and owner checks, but keep human tables separate from rated arena matches. Define what happens when a policy version is unavailable before changing table saves.

### PR 9 — deployment and operations hardening

Make the local/Tailscale test service repeatable: documented port selection, isolated database and cookie prefixes per rules version, backup/restore checks, health diagnostics, and a verified preview or local test link. Keep public exposure opt-in and separate from the stable service.

## Done criteria for the current playtest

- CI passes for formatting, tests, Clippy, Wasm, release build, container smoke, and browser assets.
- A new account can create a 6.11 table and sees its version in the shelf, table bar, and game header.
- The same account can reopen 4.9 and 5.10 tables and the loader keeps each on its archived engine.
- The arena shows separate 5.10 and 6.11 pools, 20 games per calibrated profile, placement-based Elo, and the ranked replay list.
- At least one replay can be opened, stepped backward and forward, jumped by round, and taken to the final Elo view on desktop and mobile.
- The existing stable and 5.10 local services remain playable throughout the experiment.

The companion tracking issue records the remaining decisions and links the next implementation work: [Playtest roadmap after PR #5](https://github.com/CardBoardStudio/drawing_board/issues/6).

## Streamlined Reach 12.17 requested modifications

- Remove public awards and their Prestige.
- Compact the Your Command resource totals and remove their descriptions.
- Remove the council directive and its resource bonuses.
- Trash each eligible discarded card for three of one chosen resource type.
- Collect full gains and let the player choose excess-resource discards.
- Let Settlers, Fleets, and Explorers discover worlds.

## Implemented in the 13.18 excavation experiment

These requests follow the six-change 12.17 playtest and are implemented together in the 13.18 experiment.

- Remove Research Stations.
- Purchasing an Explorer adds an Excavate card directly to that player's hand.
- Excavate collects a relic, removes it from the board, and grants a relic-deck card into the player's hand. Trash the Excavate card immediately after use.
- Replace the random relic draw with a visible row of three relic cards. The excavating player chooses one.
- Increase the map to eight inner worlds and four home worlds, for twelve worlds total.
- Add single gray Moons that produce no resources. Relics may appear on planet hexes and moons.
- Keep at least one empty space tile between separate worlds and moons, and between moons. Larger gaps are allowed.
- Add a development-only Reveal entire map toggle for worlds, moons, relics, resources, buildings, and units. Switching it off restores normal fog of war.
- Keep every player's units visible to every other player, including in unexplored regions and empty space, independently of the development toggle. Map icons and Sector Scan must agree.

Confirmed defaults: excavation costs 1 Matter, 1 Energy, and 2 Data; keep the Explorer; gain 1 permanent Prestige; four moons and twelve relics total; refill the chosen row slot immediately. Trash the used Excavate card.

## Implemented in the 14.19 Fair Frontier experiment

- Make the player's **Deck** count clickable to inspect the cards currently in that deck. Show card identities and quantities grouped or sorted, without revealing their draw order.
- Keep world and moon positions randomized, but distribute each fairly evenly across the map. Give every starting faction comparable access and travel distances to nearby worlds and moons; avoid excessive clustering or large underserved regions while preserving the minimum empty-space gaps.
- Remove the Rich planet mechanic, its ★ markers, and its extra production bonus. Keep those planet hexes as ordinary resource planets, and update affected card effects and rules consistently.
- Reduce the map by one hex on every side: board radius 12 → 11. Fit the home worlds, randomized inner worlds, and moons inside the smaller board while preserving fair access and minimum empty-space gaps.
- Change each starter upgrade from 1 Data to two of one chosen resource type, as confirmed by the user.
- On successful excavation, consume one Explorer at the relic site as well as permanently trashing the used Excavate card. This supersedes the 13.18 rule that keeps the Explorer; unsuccessful or canceled choices consume neither.

Confirmed card treatment: remove Terraforming Protocols from the new market; Worldweaver Spore keeps its immediate gain from up to two unoccupied owned planet hexes, without a permanent production effect.

- All newly gained cards enter discard by default: unit-bundled orders (including Excavate), relic rewards, and purchases. Drawing/shuffling owned cards and returning an existing card to hand keep their printed behavior. No gain-to-hand exceptions are introduced.

## Implemented in the 15.20 Tactical Combat experiment

- Replace the shuffled military deck with two Concentrated Fire and two Defensive Screen per side per battle. Secret commitments reveal together, consume cards, and offer no replacement draws. Maximum three volleys.
- Try Fleet attack 3/hull 7, Explorer 1/1, Settler 1/2 (4 defending), Fire +1 and Screen 2. Damage is the direct surviving attack sum, simultaneous, and persists between volleys.
- Before tactics, allow paid adjacent Explorer escape at 1 Energy per Explorer, respecting safety and unit capacity. Remaining mixed-group ships fight.
- Require a Fleet for War-Song and Obelisk’s largest offensive bonuses; keep normal reactions automatic.
- After three volleys defenders hold. Attackers retreat to a safe adjacent hex with room or are destroyed. Remove power-ratio automatic retreats; preserve Emergency Jump’s printed condition.
- Pause human or AI Operations for a serializable battle continuation, including human defense during an AI turn. Keep commitments private and complete the original Move exactly once.
- Show available tactics, public used cards and unit damage, plus base/bonus/shield breakdowns. Preserve 14.19 tables/replays and policy 10.

- Put the shared relic row in a dedicated Relics console tab. Browse anytime; starting or targeting a valid excavation site opens it automatically. Keep payment help, disabled unaffordable choices, resource conversions through Hand, and cancellation together without changing excavation mechanics.

## Implemented in the 16.21 Compact Frontier experiment

- Shrink the board by one hex on every side: radius 11/397 cells → radius 10/331 cells. Keep twelve complete worlds, four moons, twelve relics and comparable access, with the same separation and fairness bounds. Preserve 15.20 games and policy 11; change no other mechanics.

### Nearest Probe24.29 — published

PR33, commit6d4d579c82de257b9a958cb7e4a52fb5b900b6d0, successful Render deployment7753920137: https://drawing-board-pr-33.onrender.com/galactic-reach/. Probe locates the nearest unclaimed, privately unlocated relic from an owned Explorer anywhere; no world/moon arrival required. Private signal only. New games use24.29/save24/policy20; pinned23.28 remains archived. Seven packaged live assets match, anonymous rules/navigation and390px rules viewport verified. Storage planning was compared separately under corrected Probe and published in25.30 below.

### Storage Planning25.30 — published and simulated

PR34, commit e7073e2697fbbde7c8339275d460475893bf35a1, successful Render deployment7754137083: https://drawing-board-pr-34.onrender.com/galactic-reach/. Includes corrected remote Probe. New save25/rules30/native21;24.29 and policy20 remain archived. All2592 predeclared trials finished. Revised bots won120/192 same-rule head-to-head games (62.5%;95% seed-block CI58.9–66.1%). Mixed-game overflow51.6%→34.2%; mean capacity15.8→24.6. Expansion39.3%, Military30.7%, Economy29.9%; intervals overlap. Biomass most bank-requested; Matter most discarded; gift estimates inconclusive. Standalone report/raw bundle: analysis/storage-planning-25.30-results/. Rules, JS, Rust/Wasm and final container smoke checks all pass.

### Requested refinements26.31 — published

Probe and Colonize permanently trash on successful use; conversions still discard and failed/canceled attempts keep the card. Add +X current gross per-round production below each available resource amount. Raise Fleet cap6→10 per faction, retaining Settler8/Explorer5 and five units per hex. PR35 source60dbf2f7eab161616cbd9d28b9578b5791c6f796 preserves25.30/native21, with26.31/save26/native22 for new games. Private24.29 report review is local at output/24.29-round20-review.html; it predates the storage fix and is not a benchmark of26.31.

Verified successful Render deployment7754897856 for60dbf2f: https://drawing-board-pr-35.onrender.com/galactic-reach/. Matching rulebook and7 packaged assets, anonymous navigation, Building anchor, Fleet10 and +X beneath each stock amount checked. Source and packaged rulebook,27 JS suites/49 dialogs, Rust/workspace/Clippy/Wasm and final container API smoke all pass.

### Resource Capacities 28.33 — merged and live

PR #40 merged as `79f4bb0845e1cd8ab526a13210f3ebb493fa1606`; successful stable Render deployment `7789443241`. Live game: https://drawing-board-p0g3.onrender.com/galactic-reach/ . Canonical rules: the same origin at `/galactic-reach/rulebook.html`. Per-resource capacity allocation, one-resource Harvesters, removal of all building upgrades, and larger desktop symbols/text are published. Start a fresh 28.33 game; pinned/guest 27.32 remains archived. All required main CI passed, including four complete packaged Galactic Reach rotations. Eight exact-source desktop accessibility scans have zero axe or supplementary contrast failures; no mobile work. Verified 26 anonymous live/archive assets and in-app browser controls. The developer change-queue PR #39 remains open and separate. Implementation worktree: `/private/tmp/drawing-board-resource-capacities`.

### Streamlined Operations 29.34 — merged and live

- Automatically discard the excess of each resource above its own storage limit after collection. Remove the mandatory overflow-discard prompt, since the independent limits determine exactly what must be discarded.

- Replace Construct II’s resource discount with up to two builds using that card. Pay the normal cost for each ship or structure built. The second build is optional; the player may finish after building only one thing.

- Remove the five-ship limit per faction on a hex. Allow any number of that faction’s ships to share a hex, including mixed Fleets, Settlers, and Explorers. Apply this consistently to movement, commissioning, Explorer escape, retreat, and rival planning.

- Remove the occupation/seizing mechanic and its production blocking. Moving onto an enemy-owned hex or winning combat there must not block its owner’s production or transfer ownership. Remove occupation markers and the “seized the hex” messaging. Keep actual Colony capture as a separate Colonize action with a Settler and 1 Biomass, without an occupation prerequisite.

- When buying four capacity points, prefill the allocation with 1 Matter, 1 Energy, 1 Biomass, and 1 Data. Let the player edit that allocation before confirming the purchase.

PR #43 merged as `6222c8a6ef512e40be4d784bf197e966c5f6561c`. PR #44 completes free trade responses between Construct II builds and merged as `8c86ccc2bd7e921fbffe9041a6b0af7617e6dba6`. Successful stable Render deployment `7791558767` was verified for that final commit on November 14, 2026. Live game: https://drawing-board-p0g3.onrender.com/galactic-reach/ . Canonical rules: the same origin at `/galactic-reach/rulebook.html`. Start a fresh 29.34 game; 28.33 and older pinned tables retain their archived engines.

All required final main checks passed: 30 JavaScript suites, dialog and replay coverage, rules contract, Rust workspace tests, formatting, Clippy, Wasm, packaged rules, and the container HTTP gameplay smoke with Galactic Reach seat rotations and exact-once retry. Nine desktop accessibility scans passed with zero axe or supplementary contrast failures in PR #43; PR #44 changes the adapter and clarifies the rulebook. Final live verification matched 30 anonymous current/archive assets, confirmed version 29.34 and the five-item summary in the in-app browser, and checked game-to-rules navigation and the Construct II anchor. No mobile work. The developer change-queue PR #39 remains open and separate. Implementation worktree: `/private/tmp/drawing-board-streamlined-operations`; verified release tree `c4732d711c0cc40ba55b83a164975947c9573ace`. Local evidence: `output/streamlined-operations-29.34-live-verification.json` and `output/streamlined-operations-29.34-live.jpg`.

## Current requested changes

Implemented in [PR #68](https://github.com/CardBoardStudio/drawing_board/pull/68) (`codex/experiment-starter-conversion`); pending review and merge:

- Level III Move and Construct draw one card only when their order is used.
- Only level I original Move and Construct starters may convert to resources. Bulk conversion leaves every other card in hand.
- Remove cards whose played effects grant resources, including combined effects, repeated production, build rewards and combat loot. Remove Galactic Senate Seat as requested.
- Keep Monument of Accord and Dyson Lattice: award Prestige when bought, gain the card into discard for normal deck circulation, give it no playable or conversion effect, and allow it to be trashed on a later Buy turn without losing earned Prestige.

Earlier queued portal and November 14 feedback work was adopted in [PR #61](https://github.com/CardBoardStudio/drawing_board/pull/61). Probe skips known relics and unlimited affordable purchases were merged in [PR #62](https://github.com/CardBoardStudio/drawing_board/pull/62). The current strategic rivals were merged in [PR #63](https://github.com/CardBoardStudio/drawing_board/pull/63). Those completed items are not pending.

## Published: Split Moves 33.38

PR #49 and test-only follow-up PR #51 were merged with user authorization. Stable Render deployment 7794597619 successfully serves `bee85a9aa194a34bffa416fbafb35aeb8889c7c1` at https://drawing-board-p0g3.onrender.com/. Main CI and rules checks passed; 46 anonymous current/archive assets and same-origin rulebook navigation were verified. New rules experiments stay in their own unmerged PRs.
