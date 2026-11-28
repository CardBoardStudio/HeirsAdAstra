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
