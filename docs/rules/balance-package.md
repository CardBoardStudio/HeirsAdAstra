# Balance Package (34.39 playtest)

**Request.** The captain answered the 2026-11-14 rules review's top recommendations: (1) ship the three tested changes together, (2) keep the Prestige target menu as it is (default 40), (3) shuffle seats, (4) leave the combat tactic step unchanged, and (5) fix the weak cheap cards and Archive Purge. This playtest does exactly those things on top of 33.38 Split Moves.

**Rules** ([#combat](../../prototypes/galactic-reach/rulebook.html#combat), [#victory](../../prototypes/galactic-reach/rulebook.html#victory), [#cards](../../prototypes/galactic-reach/rulebook.html#cards), [#buy](../../prototypes/galactic-reach/rulebook.html#buy), [#construct-two-builds](../../prototypes/galactic-reach/rulebook.html#construct-two-builds), [#solo-seating](../../prototypes/galactic-reach/rulebook.html#solo-seating), [#shared-tables](../../prototypes/galactic-reach/rulebook.html#shared-tables), [#rival-cards](../../prototypes/galactic-reach/rulebook.html#rival-cards)):

- **Captures need a Fleet.** A capture needs a Settler *and* at least one of your Fleets on the enemy Colony's center, with no enemy ships or Shipyard there. Colonize consumes the Settler; the Fleet stays. This applies to every colony card that captures (Colonize, Seed Ark, Colony Pods, Genesis Charter, Genesis Seed Vault). Founding a neutral Colony is unchanged. Engine: `captureFleetAt` / `canCaptureAt` guard `colonizePlanet`, so the adapter's legal actions and the human's context buttons follow.
- **Decisive combat victory = 2 Prestige** (`COMBAT_VICTORY_PRESTIGE`). The archived 30.35 20-point game keeps 1, as do 31.36–33.38.
- **Wonder trim.** Dyson Lattice 6 → 5 Prestige, Galactic Senate Seat 4 → 3. Prices are unchanged.
- **Cheap cards.** Prefab Yards and Orbital Foundry: "…then you may build once more at full price" (the Construct II `pendingConstruct` step, now named after the card). Mining Charter and Bio-Reactor: "then draw one card". Procurement Hub: "you may buy one more card this Buy; it costs 1 less of each resource". The discount applies to the next purchase after using the card (`buyHubDiscounts`) and stacks with Trade Syndicate's. Boarding Marines: +2 hits (loot unchanged).
- **Archive Purge choice.** Choose up to two level I starters in your discard pile, or fewer, or none. Legal actions list each choice once, in discard order (`trash: [ids]`), so a shared table's field-by-field command match is unambiguous. The browser opens a checkbox dialog.
- **Dealt seats.** Solo: the three rival factions are dealt to seats 1–3 at random each new game (name, colour and profile travel together). Seat 1 shares your half of the map, and New game names it. The lineup is dealt after the map, so the galaxy for a given random stream is unchanged. Headless and shared-table engines keep the default lineup. Shared tables: `random_seats` deals people to random seats at Start; AI rivals fill the rest with their seat's faction.

**Rivals.** Browser rivals send a Settler to an enemy center only with a Fleet in its group or already there. A rival keeps one Fleet with a Settler that can capture where it stands, including under split moves. For Archive Purge, rivals keep at least 3 Move-order and 2 Construct-order cards and trash only the surplus. Native policy 26 does the same. It reads `captureNeedsFleet`, `marketPrestige` and `tacticStats` from the observation, so 31.36–33.38 tables, which publish none of them, play exactly as before.

**Evidence (AI only).** The scout's paired harness from the review: browser rivals in all four seats, 32 map seeds × 12 mixed lineups = 384 games per side, target 40, up to 120 rounds. Both sides use the same seeds, so the games are paired. Base is 32.37 (`main` at `0659abf`), the ruleset the review measured. Variant is this branch's final tree. CIs resample whole seeds. The only harness edit is one anchor, because #47 moved the headless port into `headlessPort()`.

| Paired, target 40 | 32.37 | 34.39 | 95% CI of diff |
| --- | ---: | ---: | --- |
| Rounds, mean (10th–90th) | 33.7 (27–42) | **30.7** (25–37) | −3.6 to −2.5 |
| Operations actions per game | 505 | 437 | −80 to −57 |
| Colony captures per game | 20.1 | **5.8** | −15.3 to −13.2 |
| … reclaims / home worlds | 7.2 / 3.8 | 1.4 / 0.7 | |
| Winner captured in the final round | 67% | **28%** | −45 to −33 pp |
| Combats (decisive) per game | 9.2 (7.7) | 14.2 (12.0) | |
| Win % per appearance, Military / Economy / Expansion | 19.3 / 25.0 / 30.7 | **25.4 / 25.2 / 24.4** | |
| Seat win share 0 / 1 / 2 / 3 | | 24.0 / 26.6 / 22.9 / 26.6 | |

Card edges (purchase-adjusted win effect, pp, same games; ±3 is noise): Boarding Marines −3.2 → −0.6, and it is now played (0.69 uses per owner, from 0). Archive Purge −2.3 → −0.7. Bio-Reactor −4.8 → −2.5. Procurement Hub −6.2 → −3.5. Senate Seat +5.9 → +3.7. Dyson Lattice +6.8 → +6.4. Mining Charter (−3.8 → −4.0), Orbital Foundry (−3.0 → −4.2) and Prefab Yards (−6.3 → −6.0) did not improve in AI play. Rivals value cards by price, not by effect, so a human playtest should judge those three.

Out of scope, as decided: the Prestige target menu, combat tactics, and the review's other recommendations.
