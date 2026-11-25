# Military Focused: a majority through combat

The production-first Military Focused policy won **232 of 384 fresh-map games (60.4%)**, with a map-block bootstrap 95% interval of **54.9–65.9%**. The original Focused policy won 119/384 (31.0%) on the same maps. Combat victories and Victory Doctrine supplied **86.8% of the selected policy's points**. This meets the requested majority goal against the unchanged Military, Economy and Expansion rivals.

The canonical [Military Focused section](../../prototypes/galactic-reach/rulebook.html#military-focused-rival) describes the adopted behavior. It still founds only one world beyond home, commissions Fleets on the second world, fills its two worlds with Harvesters, and supports combat through capacity, draw, exchange and military cards. No costs, movement rules, attack/hull, tactics allowance, scoring, market supply or victory target change. These results evaluate browser rivals, not a Rust decision policy or human-player balance.

## What improved

The adopted policy bootstraps missing Data and Life Harvesters before its home Shipyard. It protects the second Colony's Life payment during travel and prioritizes two early Move upgrades after an upgraded Construct. It normally keeps five to ten Fleets together. Through round ten, four may take a favourable fight reachable in one Move. It leaves empty enemy worlds alone and rejects purchases for unrelated Prestige.

| Opening step, mean round | Original Focused | Earlier opening | Production-first |
| --- | ---: | ---: | ---: |
| Second Colony | 6.43 | 6.16 | 4.76 |
| First Fleet built | 8.12 | 7.21 | 5.57 |
| First Fleet move | 10.48 | 9.30 | 7.54 |

Timing means include every game reaching the step, including losses. The selected policy averaged 9.40 Harvesters and 3.60 paid Capacity Modules; world losses can reduce the final held count. It never exceeded two held Colonies, excavated a relic or earned card Prestige unrelated to combat.

## Fresh validation

The candidate was selected on development games, then frozen before 96 disjoint new map seeds were played. Each map rotates all four starting seats for each of three policies: **1,152 planned logical games**, 384 per policy. All six relative opponent orders occur on 16 maps; each of the 24 complete seat assignments appears 16 times per policy. All games use the ordinary nine-card market and 30-Prestige target.

| Focused policy in the lineup | Focused wins | Military wins | Economy wins | Expansion wins |
| --- | ---: | ---: | ---: | ---: |
| Original | 119 (31.0%) | 66 (17.2%) | 122 (31.8%) | 77 (20.1%) |
| Earlier opening | 210 (54.7%) | 46 (12.0%) | 84 (21.9%) | 44 (11.5%) |
| Production-first | 232 (60.4%) | 51 (13.3%) | 73 (19.0%) | 28 (7.3%) |

The selected policy improves on the original by **29.4 percentage points**, paired 95% interval **22.7–36.2**. Its observed gain over the earlier opening is **5.7 points**, interval **−1.0–12.5**; that additional advantage remains uncertain. The earlier opening's own win-share interval is 49.0–60.4%, while production-first's interval is entirely above 50%.

Intervals use 20,000 percentile-bootstrap resamples of whole map blocks, preserving their four seat rotations. Paired comparisons resample the same blocks together. The selected version bundles several decision changes, so this is not a causal estimate of any single weight or upgrade choice.

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
- Round 5, 384 games: defensive target priority and paired immediate strikes remain exploratory. The selected combination won 30/48 versus the production-first incumbent's 29/48. It is not adopted without fresh confirmation.

Raw win shares from different cohorts should not be read as paired comparisons. For example, the same earlier-opening source won 46.9% in one held-out cohort and 54.7% in the larger one.

## Recovery, verification and retention

All **1,152 planned logical games** finished and passed source/trace/state/counter/RNG integrity checks, every-decision and whole-game resource accounting, production receipts, scoring reconciliation and the two-world/no-relic/no-unrelated-Prestige constraints. No planned seeds or losses were dropped.

The first execution hit ORCD's home inode quota. Its 305 physical attempts remain retained: 291 complete manifests and 14 partial journals. There were 282 completed, independently audited rows available to reuse; nine additional complete-but-unrecorded attempts and fourteen partial attempts were rerun. The recovery completed the remaining 870 logical tasks with identical frozen policies, tasks and RNG seeds. Count one final outcome per preplanned task, not both copies of a rerun. In total, 1,175 physical attempts are retained for this 1,152-game plan.

Lossless hard-link consolidation of identical frozen source files freed 24,285 inodes, verifying every source hash before and after; no game, manifest, trace, source path or source byte was pruned. A repeated original-policy game matched all 5,116 retained state/counter/RNG checkpoints. A genuinely partial selected-policy game matched its 4,092 retained checkpoints before extending to 4,256. The original job was `30416286`; recovery job `30417854` completed with exit `0:0` on `node1620`.

Reproduction identifiers:

- Original source commit: `af501e5759fc26002ea2a09036a1a4ef4371b01c`.
- Adopted `app.js` SHA-256: `b1949d6b7ce86a57e8c043c6073a7ef374ca30993a5b5e8123ebe74d32bda3df`. The promoted executable matches it exactly; final player-facing rulebook wording describes the selected preparation and group sizes.
- Validation protocol SHA-256: `e0303edf60728f6d992198f891fb99a2ecfaa6156b5f6f86ed5d405b9ce9492c`.
- Complete audited rows SHA-256: `e04cf9942c44af336d252ad7a12ef910395ac05d3915b4acc7cce0884c485c32`.
- Local study parent: `output/military-focused-improvement-20261125/`. The original validation is `run-validate-r4-48b9e2f60c`; recovery is `run-validate-r4-48b9e2f60c-recovery1`. Recovery retains `results/games.completed.jsonl`, `recovery-provenance.json`, `analysis/report.html`, `analysis/summary.json` and the exact analysis source/manifest. The original 282-row prefix and interruption inventory remain separate.
- Full histories: `/home/maxhays/galactic-reach-simulations/focused-run-validate-r4-48b9e2f60c/results/games/` and its `-recovery1` counterpart on ORCD. Every final row records its exact archive path. Full private positions, counters, actions/events and RNG follow the [simulation archive contract](../simulation-archives.md).
- All 672 histories from the first two development rounds are also retained in the locally downloaded and checksum-verified `focused-completed-r1-r2-20261125.tar.gz` bundle.

Optimization continues at the user's request. A majority in this frozen test does not authorize merging the PR or changing the three opponent policies.
