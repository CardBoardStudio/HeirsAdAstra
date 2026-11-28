# Military Focused purchase reserves

## Diagnosis

The prior three-fix candidate (`56205e300`) won fewer Military Focused games in a 64-game paired comparison. Retained event archives show 5.63 Fleets commissioned through round 10 versus 9.41 for the main baseline; the first raid averaged round 9.75 versus 7.66. Most of the point loss came from combat victories (9.81 versus 14.03), not card Prestige.

The construction guard exposed a conflicting reserve: `aiImmediateProtection` treated the next ordinary military build as an emergency. `aiBuyInvestment` then added that build price to the purchase price. With 4 Matter and 4 Energy, a one-of-each Capacity Module reserved 3 Matter and 3 Energy, preventing a Fleet even though one Fleet and the Module were both affordable. Across eight retained updated-policy games, 114 construction decision checkpoints deferred a funded build while protecting an investment. These checkpoints establish a decision-level mechanism; mixed-match historical scores alone do not isolate causal win-rate effects.

Applying the repair to those exact saved positions permits a funded build at 99 of the 114 checkpoints while preserving the actual purchase price. The remaining blocked decisions are not waived. Fourteen focused cases pass, including actual opening/defense reserves, surplus commissioning, second-build protection and an exact-price military-card purchase. The two new reserve-failure cases fail against the prior candidate.

## Intended policy

For Military Focused, protect the highest-priority actual opening necessity or urgent defense, plus the opening Colony's Life payment when applicable. Do not reserve another ordinary Fleet or Harvester as emergency protection. Keep useful held purchase prices protected through builds, bank funding and second builds. A routine Fleet may proceed if its real payment leaves that purchase payable. At 4 Matter, 4 Energy, 1 Life and 1 Data, one Fleet may be commissioned while preserving a Capacity Module; a second Fleet must wait if it would spend the Module payment.

Preserve the two-world strategy, gathering/raiding behavior, all other profiles, cards including Ascendancy Codex, costs, legal actions, combat, scoring and archived engines. No extra state or RNG is introduced. This is a breaking policy continuation of the three bot fixes. Rules grounding: canonical `#military-focused-rival`, `#rival-cards`, `#building`, `#capacity-module`, `#buy` and `#combat`.

## Prospective validation

Check real retained decision positions and focused fixtures, including opening and actual defense reserves, exact-cost expensive purchases, surplus Fleet commissioning, second-build payment protection, free builds and private-information invariance. Freeze the candidate before a 64-game comparison on disjoint unused seeds. In each matched pair, change only the Military Focused seat between the prior candidate and the repair; keep the other three rivals on the same prior policy. Eight maps, four seat rotations and two arms give 32 matched pairs and 32 Military Focused seats per arm. Retain and verify complete archives, exact sources, private states, engine counters, actions/events and random streams. Compare Military Focused wins, Prestige, Fleet production and raid timing; do not treat wins by unchanged rivals as wins for the treatment.

## Fresh comparison result

All 64 games completed, all 32 initial-position pairs matched and all archives verified. Military Focused won 6 of 32 repaired games versus 2 of 32 previous-policy games. Mean Prestige rose from 16.38 to 20.13, combat victories from 9.63 to 11.69, and card Prestige from 1.13 to 2.63. Mean purchases rose from 12.91 to 15.91. Fleet commissions through round 10 rose only slightly, 6.63 to 6.88; first-attack timing was unchanged at round 9.47. The repair helps both affordable construction and useful purchases; these results do not support claiming that it recovered the entire historical raid-timing gap.

The gain was concentrated in the two-Economy lineup: 5 versus 1 wins and 22.44 versus 14.94 mean Prestige over 16 games per arm. The lineup including Military had 1 win per arm and identical mean Prestige of 17.81. This is a controlled improvement over the prior candidate with meaningful lineup variation, not a new direct comparison with main or a calibrated human-difficulty estimate. The eight seeds are the independent map samples; rotations are correlated.

All 18 verification groups passed, including 14 focused cases, full mechanics, 105 dialogs, replay reconstruction and 120 matched browser/server policy decisions. Only the focused reserve helper changed in the engine; the full card catalog, including Codex, and legal-action adapter match the prior candidate. Exact delivered engine/rulebook hashes match the frozen comparison. Source/packaged rules, anonymous game-to-rules navigation and 1280/390-pixel rulebook layouts passed. Full Rust/Wasm compilation remains unavailable on this host because Cargo is absent.

Private archive locators, protocols, frozen sources, per-game results, checksums and verification proofs are retained in persistent output `military-focused-recovery-20261128`. This continuation remains local and unmerged.
