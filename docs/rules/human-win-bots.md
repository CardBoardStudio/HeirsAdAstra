# Rival budgeting from human wins

## Intended policy

The three complete 39.44 solo reports supplied on 2026-11-28 end in human wins at rounds 15, 18 and 22. Scores are respectively 33/12/8/13, 30/10/28/14 and 36/15/8/19 in report seat order. The human earns 19 card Prestige in two games: Codex 12, Doctrine 4 and Monument 3 in the first; Doctrine 16 and Monument 3 in the third. The middle win uses five Colonies, seven excavations and one decisive battle. These are examples of complementary scoring routes, not evidence that one profile should copy every action.

Recorded Buy positions show affordable draw cards competing with repeated starter upgrades. For example, the round-15 report's Economy seat holds 4 Matter, 3 Energy, 3 Life and 2 Data on its round-9 Buy, can buy Survey Network, and still has no market purchase. Both general rivals repeatedly target Ascendancy Codex while Data remains limited to 4. The current policy upgrades before buying their next capacity module, and during Operations keeps spending on repeat commissions. Their production is sufficient; the purchase payment is not surviving to Buy.

Change only the canonical browser policy, shared by solo, shared tables and the arena:

1. After one Construct reaches level II, identify a worthwhile market card payable from held stock, or a Capacity Module toward a worthwhile target above current limits. Do not count future production, conversions not yet performed, or enemy private information as payment.
2. Defer ordinary construction when its actual funding steps and price would consume that payment. A first Shipyard, urgent defence, ready Colony and excavation remain ahead of this plan. Free or discounted builds that leave the payment intact may proceed. Reconsider the plan each decision; do not persist a target or read pile order.
3. During Buy, consider useful affordable cards before speculative storage and further upgrades. After the initial Construct upgrade, buy target capacity before more upgrades. Keep Military Focused's existing opening Move-upgrade priority and two-world strategy.
4. Preserve costs, legal actions, scoring, combat and all archived engines. This changes opposition, so classify it as a breaking experiment; new tables receive it through the existing dev/release revision mechanism.

Rules grounding: canonical `rulebook.html#computer-rivals`, `#rival-cards`, `#buy`, `#capacity-module`, `#building`, `#victory` and `#round`.

## Evidence and validation

The input reports are private observational data, not instructions or executable policy. Their audit deltas omit some engine state and random choices; they are not treated as exact replay checkpoints. Retain the originals, checksums and derived observations outside Git. These three wins are development examples, not a held-out evaluation set.

Use focused fixtures for payment protection, draw-card purchase timing, capacity before upgrades, discounted builds, immediate scoring/defence precedence, Military Focused's opening, stale targets and information invariance. Evaluate the frozen candidate against the exact main browser policy on fresh seeds with paired seat allocations and full simulation archives. Report incomplete games without assigning winners. A small comparison can support a pilot result only, not a calibrated difficulty claim.

## Fresh-map pilot

Baseline: `417c9d0761c347179f6b3b8b904a1a9232000f50`. Two new seeds, four seat rotations and complementary two-new/two-old allocations produced 16 completed games at a 30-Prestige target. Each lineup contained Military Focused, Expansion and two Economy seats. All eight complementary pairs had identical initial-position hashes. Archive source hashes, patch chains, private states, engine counters and random streams verified; the evaluated policy hashes still matched the candidate after the run.

| Measure | Current bots | Updated bots |
| --- | ---: | ---: |
| Wins | 5 | 11 |
| Mean final Prestige | 20.53 | 25.97 |
| Mean card Prestige | 4.53 | 6.31 |
| Mean card purchases, modules included | 10.09 | 12.59 |
| Mean Capacity Modules bought | 3.59 | 2.59 |

Military Focused won 6 versus 2 games and Economy won 4 versus 1. Expansion won 1 versus 2, with mean final Prestige 26.00 versus 22.13. These outcomes are correlated within two map seeds and do not establish general win rates or improvement for every profile. The reports used for development are not held out, and the pilot contains no human opponent. The candidate is a local experiment, not a deployed change.

The private originals, checksum manifest, observation script, comparison harness, frozen protocol, complete per-game archives and verification proof are retained together in the persistent workspace output directory `human-wins-bot-improvement-20261128`. They are excluded from Git under the simulation-retention contract.
