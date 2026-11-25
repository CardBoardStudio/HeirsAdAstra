# Military Focused: a majority through combat

The shorter-hunt Military Focused policy won **265 of 384 fresh-map games (69.0%)**, with a map-block bootstrap 95% interval of **64.3–73.7%**. Its frozen production-first predecessor won **236/384 (61.5%)** on the same maps. The paired gain is **7.6 percentage points**, interval **1.6–13.3**. Combat victories and Victory Doctrine supplied **86.0% of its points**.

The earlier production-first policy had already established a majority: 232/384 (60.4%) versus the original Focused policy's 119/384 (31.0%) on one shared cohort, and 237/384 (61.7%) on a second independent cohort. The new result compares shorter hunts with that strong predecessor, rather than mixing percentages from different maps.

The canonical [Military Focused section](../../prototypes/galactic-reach/rulebook.html#military-focused-rival) describes the adopted behavior. It still founds only one world beyond home, commissions Fleets on the second world, fills its two worlds with Harvesters, and supports combat through capacity, draw, exchange and military cards. No costs, movement rules, attack/hull, tactics allowance, scoring, market supply or victory target change. These results evaluate browser rivals, not a Rust decision policy or human-player balance.

## Shorter hunts: current selection

The new policy gives distance to a favourable weak group more weight. For example, it may attack two enemy Fleets reachable now rather than spend another Move travelling toward one Fleet. Its opening, four-Fleet early opportunity, five-to-ten-Fleet cohesion, two-world cap and purchases are otherwise the same as the production-first predecessor. The exact frozen executable is adopted; experimental leader pressure, extra escape avoidance and stricter counterattack gates were not selected.

The candidate was frozen after round 6 development, then tested on **96 disjoint fresh maps × four seats × two policies = 768 games**. All six relative opponent orders are balanced. All 768 games completed and passed audits without interruptions or exclusions, under the ordinary nine-card market and 30-point target.

| Focused policy | Focused wins | Military wins | Economy wins | Expansion wins |
| --- | ---: | ---: | ---: | ---: |
| Production-first predecessor | 236 (61.5%) | 49 | 73 | 26 |
| Shorter hunts | 265 (69.0%) | 39 | 58 | 22 |

| Points, mean across all games including losses | Military Focused, shorter hunts | Economy in the same lineup |
| --- | ---: | ---: |
| Held Colonies | 4.13 | 10.52 |
| Ordinary combat | 24.31 | 1.89 |
| Card Prestige | 1.06 | 2.57 |
| Relics | 0 | 5.93 |
| Total | 29.50 | 20.91 |

All selected-policy card points are combat-derived Victory Doctrine. It never exceeded two Colonies or earned relic/unrelated card points. This is evidence against these unchanged browser rivals, rather than human-player balance.

The study is `run-validate-r6-01fbd74e32`, with all outcome/archive paths and download checksums retained in its local results and `retrieval-status.json`. The exact `app.js` SHA-256 is `1206c485baf344fdf8b05d93b509917c5037edcec76642405d531d0e28565438`; protocol `ea71c1ebcf29b8594d091ba20628000e9cfab3f74657d346c068005b026c6a0b`; complete audited rows `80c0ee408b1a8c9ba3d6c6eda32af6c44a33831954947b8b426a0588ceac8673`. Its `control` label means the production-first predecessor, not the original Focused bot. Confidence intervals use the same 20,000 whole-map resamples described below. The paired interval satisfied the predeclared positive-gain adoption gate.

## What improved

The adopted policy bootstraps missing Data and Life Harvesters before its home Shipyard. It protects the second Colony's Life payment during travel and prioritizes two early Move upgrades after an upgraded Construct. It normally keeps five to ten Fleets together. Through round ten, four may take a favourable fight reachable in one Move. It leaves empty enemy worlds alone and rejects purchases for unrelated Prestige.

| Opening step, mean round | Original Focused | Earlier opening | Production-first |
| --- | ---: | ---: | ---: |
| Second Colony | 6.43 | 6.16 | 4.76 |
| First Fleet built | 8.12 | 7.21 | 5.57 |
| First Fleet move | 10.48 | 9.30 | 7.54 |

Timing means include every game reaching the step, including losses. The selected policy averaged 9.40 Harvesters and 3.60 paid Capacity Modules; world losses can reduce the final held count. It never exceeded two held Colonies, excavated a relic or earned card Prestige unrelated to combat.

## Initial majority validation

The candidate was selected on development games, then frozen before 96 disjoint new map seeds were played. Each map rotates all four starting seats for each of three policies: **1,152 planned logical games**, 384 per policy. All six relative opponent orders occur on 16 maps; each of the 24 complete seat assignments appears 16 times per policy. All games use the ordinary nine-card market and 30-Prestige target.

| Focused policy in the lineup | Focused wins | Military wins | Economy wins | Expansion wins |
| --- | ---: | ---: | ---: | ---: |
| Original | 119 (31.0%) | 66 (17.2%) | 122 (31.8%) | 77 (20.1%) |
| Earlier opening | 210 (54.7%) | 46 (12.0%) | 84 (21.9%) | 44 (11.5%) |
| Production-first | 232 (60.4%) | 51 (13.3%) | 73 (19.0%) | 28 (7.3%) |

The selected policy improves on the original by **29.4 percentage points**, paired 95% interval **22.7–36.2**. Its observed gain over the earlier opening is **5.7 points**, interval **−1.0–12.5**; that additional advantage remains uncertain. The earlier opening's own win-share interval is 49.0–60.4%, while production-first's interval is entirely above 50%.

Intervals use 20,000 percentile-bootstrap resamples of whole map blocks, preserving their four seat rotations. Paired comparisons resample the same blocks together. The selected version bundles several decision changes, so this is not a causal estimate of any single weight or upgrade choice.

## Independent replication and rejected additions

A second **96 fresh maps × four starting seats** reproduced the majority for the exact same production-first executable: **237/384 wins (61.7%)**, map-bootstrap 95% interval **56.8–66.7%**. Combat plus Victory Doctrine supplied **86.7%** of its points. Combined with the first frozen test, this unchanged executable won 469/768 games (61.1%); the two separate cohorts remain the primary reports rather than treating their individual games as independent map samples.

The preselected challenger added public defense priority, splitting ten Fleets for two immediate safe fights, and earlier Doctrine saving. It won **234/384 (60.9%)** on these same maps, versus 237 for the incumbent. Its paired difference was **−0.8 percentage points**, interval **−5.7–4.2**. Reject those additions: the fresh comparison does not support an improvement. Neither policy changed during the 768-game plan, and all games completed and passed audits without recovery or excluded attempts.

The study is `run-validate-r5-74c126ef83`, ORCD job `30422184` (completed `0:0`, `node1620`). Full histories remain at `/home/maxhays/galactic-reach-simulations/focused-run-validate-r5-74c126ef83/results/games/`. The frozen protocol SHA-256 is `7f398e070425a1072fd9536edb0b69fd0711f5da22c368b9793dfd5ae2e2c22c`. The complete audited rows SHA-256 is `1a546fe80574ecae390327a3624e42fb7b2e3e3653961a28bf48d4766329c97d`. Its `control` label means the majority-winning production-first policy, not the original Focused policy. Locally retained `retrieval-status.json`, `analysis/summary.json`, `analysis/decision.json` and the analysis source record the download checksums and decision.

## Points across all 384 games per policy

Means include losses, rather than only winning scores. All selected-policy card points are Victory Doctrine's combat-derived reward.

| Source | Original Focused | Earlier opening | Production-first |
| --- | ---: | ---: | ---: |
| Held Colonies | 5.21 | 4.46 | 3.85 |
| Ordinary combat victories | 19.34 | 22.50 | 24.15 |
| Card Prestige | 0.35 | 1.01 | 1.16 |
| Relics | 0 | 0 | 0 |
| Total | 24.91 | 27.97 | 29.16 |

Combat plus Doctrine supplied 86.8% of production-first's points. It did not buy an economic scoring engine or expand beyond its two-world plan to achieve the majority.

## Development trail

Each development round used 12 new map blocks with four seat rotations, balanced opponent orders and full archives. These comparisons select candidates; they are not held-out evidence.

- Round 1, 336 games: independent small raiding groups lost. Original 20/48, strongest challenger 15/48. Reject all six challengers.
- Round 2, 336 games: cohesive groups able to grow to ten won 25/48 versus the original's 13/48. Fresh 48-map validation later gave 76/192 (39.6%) versus 53/192 (27.6%), paired interval for the gain 3.6–20.3 points. This was the first adopted improvement.
- Round 3, 384 games: the earlier opening won 23/48 versus 13/48 for larger groups and 7/48 for the original. Fresh 48-map validation gave 90/192 (46.9%) versus 76/192 and 66/192 respectively. Further improvement over larger groups remained uncertain.
- Round 4, 384 games: production-first candidates won 31–34/48. The selected four-Fleet opportunistic version won 34/48 (70.8%), versus 26/48 for the earlier opening and 20/48 for the original. The larger fresh validation above, rather than 70.8%, is the adopted evidence.
- Round 5, 384 games: defensive target priority and paired immediate strikes selected a combination at 30/48 versus the production-first incumbent's 29/48. The independent 768-game confirmation above rejected the additions.
- Round 6, 384 games: a stronger preference for nearby weak targets won 36/48 versus the incumbent's 35/48. More pressure on the public leader lost substantially (25–27/48). The one-game nearby gain was exploratory; the fresh 768-game confirmation above subsequently supported adoption.

- Round 7, 384 games: extra production before Fleets and stronger exchange buying lost (24–30/48 versus the old incumbent's 35/48). Higher draw preference tied at 35/48 and won the predeclared mean-points tiebreak, but did not increase wins. It remains unadopted and must face the new shorter-hunt incumbent in any confirmation.

- Round 8, 384 games: public one-volley tactic forecasts tied the predecessor at 31/48 at best; the predeclared mean-points tiebreak selected the worst-response model. It remains unadopted. A fixture that preserves another Fleet does not establish higher game win share.

Raw win shares from different cohorts should not be read as paired comparisons. For example, the same earlier-opening source won 46.9% in one held-out cohort and 54.7% in the larger one.

## Recovery, verification and retention

All **1,152 planned logical games** finished and passed source/trace/state/counter/RNG integrity checks, every-decision and whole-game resource accounting, production receipts, scoring reconciliation and the two-world/no-relic/no-unrelated-Prestige constraints. No planned seeds or losses were dropped.

The first execution hit ORCD's home inode quota. Its 305 physical attempts remain retained: 291 complete manifests and 14 partial journals. There were 282 completed, independently audited rows available to reuse; nine additional complete-but-unrecorded attempts and fourteen partial attempts were rerun. The recovery completed the remaining 870 logical tasks with identical frozen policies, tasks and RNG seeds. Count one final outcome per preplanned task, not both copies of a rerun. In total, 1,175 physical attempts are retained for this 1,152-game plan.

Lossless hard-link consolidation of identical frozen source files freed 24,285 inodes, verifying every source hash before and after; no game, manifest, trace, source path or source byte was pruned. A repeated original-policy game matched all 5,116 retained state/counter/RNG checkpoints. A genuinely partial selected-policy game matched its 4,092 retained checkpoints before extending to 4,256. The original job was `30416286`; recovery job `30417854` completed with exit `0:0` on `node1620`.

Reproduction identifiers:

- Original source commit: `af501e5759fc26002ea2a09036a1a4ef4371b01c`.
- Earlier production-first `app.js` SHA-256: `b1949d6b7ce86a57e8c043c6073a7ef374ca30993a5b5e8123ebe74d32bda3df`. That earlier promoted executable matched it exactly; the shorter-hunt executable is identified above.
- Validation protocol SHA-256: `e0303edf60728f6d992198f891fb99a2ecfaa6156b5f6f86ed5d405b9ce9492c`.
- Complete audited rows SHA-256: `e04cf9942c44af336d252ad7a12ef910395ac05d3915b4acc7cce0884c485c32`.
- Local study parent: `output/military-focused-improvement-20261125/`. The original validation is `run-validate-r4-48b9e2f60c`; recovery is `run-validate-r4-48b9e2f60c-recovery1`. Recovery retains `results/games.completed.jsonl`, `recovery-provenance.json`, `analysis/report.html`, `analysis/summary.json` and the exact analysis source/manifest. The original 282-row prefix and interruption inventory remain separate.
- Full histories: `/home/maxhays/galactic-reach-simulations/focused-run-validate-r4-48b9e2f60c/results/games/` and its `-recovery1` counterpart on ORCD. Every final row records its exact archive path. Full private positions, counters, actions/events and RNG follow the [simulation archive contract](../simulation-archives.md).
- All 672 histories from the first two development rounds are also retained in the locally downloaded and checksum-verified `focused-completed-r1-r2-20261125.tar.gz` bundle.

Optimization continues at the user's request. A majority in this frozen test does not authorize merging the PR or changing the three opponent policies.
