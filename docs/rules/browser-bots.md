# One policy for Galactic Reach rivals

The intended player behavior is in the canonical rulebook [computer rivals](../../prototypes/galactic-reach/rulebook.html#computer-rivals) and [rival planning](../../prototypes/galactic-reach/rulebook.html#rival-planning). Solo play, new shared tables and new arena matches use the actual `runAiOperation`, `runAiBuy` and `chooseCombatAction` functions in `prototypes/galactic-reach/app.js`. There is no separately maintained Rust scoring policy for new games.

The 2026-11-18 direct comparison used 2,016 complete 30-Prestige games on twelve map seeds, with all strategy/seat/family allocations balanced. Browser rivals won 1,643/1,728 mixed-role games (95.1%; map-bootstrap 95% interval 93.1–97.0%). They also won 66/72 Market, 70/72 Military, 70/72 Economy and 71/72 Expansion same-role games. All 1,344,623 decisions passed resource-accounting and archive checks. [Measurement PR #130](https://github.com/CardBoardStudio/drawing_board/pull/130) records the protocol. Complete histories are retained in the workstation's `output/bot-family-tournament/browser-native-3f1b513-20261118` dataset and on ORCD. This decision does not remove or rewrite any earlier evidence.

## Current studies

Use `node scripts/browser-bot-study.cjs --out <persistent-directory> --seeds 12 --seed-start 2026111801 --target 30 --profiles market,military,economy,expansion`. Run production studies on ORCD compute nodes. The runner rotates all four seats for every seed, freezes the exact sources and configuration, and retains full per-game histories, private state, counters, events and RNG, including unfinished/error outcomes. It does not accept a native binary. Existing analysis tools can still read old native results; those observations describe the retired policy and should not be presented as current-browser balance evidence.

## Server transport and replay

`BrowserProfile` has four explicit `gr-browser-*/1` identifiers. `BrowserAgent` is a transport token, not a planning implementation. The Rust game wrapper registers each browser-controlled seat and accepts exactly its matching `browser_policy` command. It calls `adapter.browserStep`, which runs the existing JavaScript policy. Human seats keep ordinary legal commands and cannot forge a policy command. Both pre/post direct-mutation command caches are cleared. Server snapshots, shuffle authority, event logging, Undo boundaries and replay frames include the full result of each browser decision.

New shared tables store browser IDs; new arena bots accept only browser IDs and use a separate `browser-v1` rating pool. Previously dealt shared tables retain their original policy IDs and exact archived engines. Historical replay reconstruction may resolve native IDs; it never changes ratings. No saved table is migrated or silently given another policy. This server-opponent change has a breaking release entry; solo opponents, cards, legal costs, victory conditions and scoring stay the same.

## Historical Rust archive

`crates/galactic-reach/src/archived_rust.rs` contains the former current policy and its compatibility tests unchanged, apart from an archive module header. `legacy_v*` files remain untouched. `archived-rust-policy.json` freezes the module hash; the bounded browser-policy regression checks it. Do not tune these policies or use them for new studies.

The old `policy-study` executable requires the explicit Cargo feature `archived-rust-bots`. The native study bridge rejects execution unless `GR_ALLOW_ARCHIVED_RUST_BOTS=1` explicitly enables a historical reproduction. Old fixtures opt in by name. These exceptions preserve recorded tables, past binaries and reproducibility; they are not supported default simulation choices. Keep old result bundles and binaries intact.
