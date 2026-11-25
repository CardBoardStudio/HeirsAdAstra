# Military Focused: a majority through combat

The route-corrected Military Focused policy won **530/768 games (69.0%)** across two independent cohorts: 192 fresh maps with all starting seats. Its stratified whole-map bootstrap 95% interval is **65.9–72.1%**. Combat victories and Victory Doctrine supplied **87.4% of its points**. The two-world plan and cohesive five-to-ten-Fleet groups remain selected.

## Actual-route correction: selected

Small early raids must reach the enemy by the legal route they actually take. A stronger enemy may block the direct route even when the target is close by distance. Four Fleets now wait or regroup when that detour would need another Move. Full hunting groups can still take longer approaches. The intended clarification was written before implementing the fix, and the blocked-route fixture was found before inspecting the preceding eight-Fleet confirmation outcomes.

A frozen **96-map × four-seat × three-policy = 1,152-game** comparison completed without failures, unfinished games or exclusions. The old uncorrected policy and corrected incumbent both won **256/384 (66.7%)**. The corrected eight-Fleet challenger won **266/384 (69.3%)**, a paired gain of **2.6 percentage points**, 95% whole-map interval **−2.1–7.0**. That strength change did not meet the predeclared positive-gain gate. Adopt only the mandatory route correction; do not promote the larger observed percentage. The corrected incumbent's own interval was 62.0–71.1%, entirely above 50%.

A second independent **96-map × four-seat × two-policy = 768-game** comparison gave the exact same corrected incumbent **274/384 wins (71.4%)**, versus **271/384 (70.6%)** for the preselected five-Fleet challenger. The challenger's paired difference was **−0.8 percentage points**, interval **−6.5–4.9**. Reject that group change. All 768 games completed and passed audits with no excluded or unfinished attempts. Combining only the identical corrected incumbent across these two tests gives 530/768; 20,000 stratified whole-map resamples with seed 2026112513 preserve all four rotations inside each cohort.

| Points, mean across all 768 corrected-incumbent games including losses | Military Focused | Economy in the same lineups |
| --- | ---: | ---: |
| Held Colonies | 3.74 | 10.04 |
| Ordinary combat | 24.96 | 2.13 |
| Card Prestige | 1.02 | 3.34 |
| Relics | 0 | 6.08 |
| Total | 29.72 | 21.59 |

All Focused card points are Victory Doctrine; the two-world, no-relic and no-unrelated-Prestige audits passed. Exact adopted `app.js`: `6257558c9bef95981863f2b38d36c3ece4359d94d1b5921d3dbea1dfa6f65011`. Study `run-validate-r11-actual-route-5f031ce7a2`, protocol `0e716fbb7fce6bb5ab830fd10e5d3d9aae6973975d9a9939d4b56108978747c5`, complete audited rows `9bdfbaa589baa5663816e23cfac51578fd5f11c5fae7897c72ddb240d438dade`. `r11-selection.json` records the primary comparison and exact adoption gate. The replication is `run-validate-r12-five-41d26c8e9a`, protocol `6041affe3b982e2d0b0a627490b934549ae4df30c6a0ac355b8210cc8951b6f6`, rows `f2219ce22edfdc21b2d381ae387490610fd4e0ef5808c3b8bded7e709167daf2`. The exact two-cohort aggregate and analyzer are retained as `corrected-policy-replications.json` and `analyze-corrected-policy-replications.py` (analyzer SHA-256 `4b3c097ddf8d27f949c4a140f3eff22d6b4a1213e9be48599e3a6176d78ed31f`). The earlier aggregate below describes a different source and is not pooled with this corrected-policy cohort.

## Earlier shorter-hunt evidence

Before the route correction, the shorter-hunt Military Focused policy won **783 of 1,152 games (68.0%)** across three independent fresh-map cohorts, with a stratified whole-map bootstrap 95% interval of **65.1–70.7%**. It won 265/384 (69.0%), 258/384 (67.2%) and 260/384 (67.7%) in the three cohorts. Combat victories and Victory Doctrine supplied **86.2% of its points**. The two-world combat plan remains intact. These figures describe the frozen evaluated policy; a small-raid routing correction is awaiting its own fresh comparison below.

The earlier production-first policy had already established a majority: 232/384 (60.4%) versus the original Focused policy's 119/384 (31.0%) on one shared cohort, and 237/384 (61.7%) on a second independent cohort. The new result compares shorter hunts with that strong predecessor, rather than mixing percentages from different maps.

The canonical [Military Focused section](../../prototypes/galactic-reach/rulebook.html#military-focused-rival) describes the adopted behavior. It still founds only one world beyond home, commissions Fleets on the second world, fills its two worlds with Harvesters, and supports combat through capacity, draw, exchange and military cards. No costs, movement rules, attack/hull, tactics allowance, scoring, market supply or victory target change. These results evaluate browser rivals, not a Rust decision policy or human-player balance.

## Shorter hunts: preceding selection

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

## Independent confirmation before the route correction

The exact same shorter-hunt executable faced a preselected smaller-raid challenger on another **96 disjoint fresh maps × four seats**, with all six relative opponent orders balanced. The incumbent won **258/384 (67.2%)** and the challenger **250/384 (65.1%)**. The challenger's paired difference was **−2.1 percentage points**, 95% map interval **−7.8–3.4**. Reject the challenger: the exploratory 81.2% development result did not confirm. The current five-to-ten plan and early immediate four-Fleet opportunity stay selected.

All 768 games completed and passed every audit without interrupted or excluded outcomes. Their complete version-2 archives retain ordinary frozen source files, full private state/counters/RNG and raw metrics inline before independent resource/scoring audits. Storage layout changes did not alter the policy.

Combining only the unchanged incumbent's two independent cohorts gives 523/768 wins on **192 map blocks**. Its combined interval resamples 96 whole maps independently inside each cohort, with 20,000 resamples and seed 2026112502. It preserves every map's four seat rotations. This is an aggregate of the two reported tests, not an additional trial.

| Points, mean across all 768 incumbent games including losses | Military Focused | Economy in the same lineups |
| --- | ---: | ---: |
| Held Colonies | 4.00 | 10.34 |
| Ordinary combat | 24.38 | 2.07 |
| Card Prestige | 1.08 | 2.86 |
| Relics | 0 | 5.96 |
| Total | 29.46 | 21.23 |

All Focused card points are Victory Doctrine. Source identity is checked against `1206c485baf344fdf8b05d93b509917c5037edcec76642405d531d0e28565438` in both frozen protocols. The second study is `run-validate-r9-compact-72d0f1a9e6`, protocol `6e0ff2be8ee7ec48048272f2bd2690bffc2ddde221d9fbbf84e36fab034aeed9`, audited rows `162dcf2a5ed1065701e656e8c3f87b2c441ea1a5cf986ba3be59fb1b40c98de8`. The combined analysis is retained as `current-replications.json` with its exact analyzer source.

## Third cohort and the actual-route correction

Another 96 fresh maps with every starting seat gave the unchanged incumbent **260/384 wins (67.7%)**. A preselected combination of nearby targeting, cohesive groups capped at eight and immediate three-Fleet opportunities won **279/384 (72.7%)** on the same maps. Its paired gain was **4.9 percentage points**, whole-map 95% interval **0.5–9.4**. All 768 requested games completed and passed every audit, with no interrupted attempts or exclusions.

The challenger is **not adopted**. Before inspecting these outcomes, a targeted fixture exposed a route-fidelity error shared by the small-raid eligibility checks. An enemy group may be close by distance while a stronger enemy blocks the direct route. Three or four Fleets can then start a detour and stop on an empty hex instead of reaching combat in this Move. This conflicts with the intended immediate-fight exception. The correction requires the actual selected legal route to reach the enemy this Move. Larger groups may still travel toward a fight.

The correction passes blocked-route fixtures for three and four Fleets, clear immediate fights, larger-group detours, planning purity and late-game eligibility. All 201 original-opponent state/counter fixtures still match. The frozen comparison used 96 disjoint maps, every starting seat and three policies: historical uncorrected incumbent, corrected incumbent, and corrected eight-Fleet challenger. Its primary comparison is corrected challenger minus corrected incumbent; a positive paired 95% interval is required for the further group change. Correct route fidelity is mandatory. That comparison is now complete; the selected-correction section above reports every outcome and explains why the further group change was not adopted.

Combining only the identical incumbent source across the three completed cohorts gives **783/1,152 wins on 288 map blocks**. The interval resamples whole maps separately within each cohort, preserving all four rotations, with 20,000 resamples and seed 2026112503. This aggregate is not another trial.

| Points, mean across all 1,152 incumbent games including losses | Military Focused | Economy in the same lineups |
| --- | ---: | ---: |
| Held Colonies | 4.05 | 10.23 |
| Ordinary combat | 24.30 | 2.08 |
| Card Prestige | 1.04 | 3.09 |
| Relics | 0 | 5.94 |
| Total | 29.39 | 21.33 |

All Focused card points remain Victory Doctrine. The third study is `run-validate-r10-e81a35cf29`, protocol `2dfd50fb56f02b7d036d23f662635bace1a154f8ff6e7b854294c78c3e1e3fb2`, audited rows `433b0bae0e4ded54f0549e3a4ead100490e3430dd23b26ddb2da7f36e8811e8b`. The three-cohort aggregate and exact analyzer are retained as `current-replications-three-cohorts.json` and `analyze-current-three-cohorts.py`; analyzer SHA-256 `57785265f7376147fed892ea7e14679fd726e0e11cc48931c49cfd5bac64464e`.

The descriptive seat analysis of these same 1,152 pre-correction games found 192/288 wins in seat one (66.7%), 199/288 in seat two (69.1%), 208/288 in seat three (72.2%) and 184/288 in seat four (63.9%). Each of the six relative opponent orders also had a majority (65.1–71.4%). These are subgroup descriptions of existing trials, not new confirmation tests. The exact analyzer and output are retained as `analyze-current-seats.py` and `current-seat-replications.json`.

## Which fights supplied the points

A read-only reanalysis of every retained history in the 384-game shorter-hunt cohort reconciled **4,668 decisive Focused combat wins** with the audited ordinary combat points. It rechecked source, trace, state, counter and RNG integrity. Starting enemy groups were:

| Enemy Fleets at the start of a decisive Focused win | Wins | Share |
| --- | ---: | ---: |
| None | 1,808 | 38.7% |
| One | 1,576 | 33.8% |
| Two or more | 1,284 | 27.5% |

Thus 72.5% of decisive wins faced at most one enemy Fleet. A group without Fleets can still contain Settlers, Explorers or a defending Shipyard. The bot lost no Fleets in **3,801 of these wins (81.4%)**; this percentage concerns winning combats, not all battles. Its opponents in those wins were Expansion 1,763 times, Economy 1,601 and Military 1,304. This supports weak-group hunting as the scoring mechanism; it does not require a broader expansion or relic engine.

All 768 histories across this cohort and the earlier independent production-first replication were reanalyzed in 48 retained chunks. Chunk-analyzer SHA-256: `935bae0701f634e66d2b2128213c73238183ad6e486e7e241eb6905e84cf6b58`; coordinator: `09158b748cf71258c5b1ff905f22a03ec268c0a57d30896b5a4b2923f04e566e`. Local `posthoc-victims-parallel-v2/` retains every chunk, source, manifest and verified download. A serial analysis helper was replaced for performance; no game histories or outcomes changed. This diagnostic did not select or retune the frozen policy.

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

The earlier development rounds used 12 new map blocks; round 12 increased this to 24. Both designs use four seat rotations, balanced opponent orders and full archives. These comparisons select candidates; they are not held-out evidence.

- Round 1, 336 games: independent small raiding groups lost. Original 20/48, strongest challenger 15/48. Reject all six challengers.
- Round 2, 336 games: cohesive groups able to grow to ten won 25/48 versus the original's 13/48. Fresh 48-map validation later gave 76/192 (39.6%) versus 53/192 (27.6%), paired interval for the gain 3.6–20.3 points. This was the first adopted improvement.
- Round 3, 384 games: the earlier opening won 23/48 versus 13/48 for larger groups and 7/48 for the original. Fresh 48-map validation gave 90/192 (46.9%) versus 76/192 and 66/192 respectively. Further improvement over larger groups remained uncertain.
- Round 4, 384 games: production-first candidates won 31–34/48. The selected four-Fleet opportunistic version won 34/48 (70.8%), versus 26/48 for the earlier opening and 20/48 for the original. The larger fresh validation above, rather than 70.8%, is the adopted evidence.
- Round 5, 384 games: defensive target priority and paired immediate strikes selected a combination at 30/48 versus the production-first incumbent's 29/48. The independent 768-game confirmation above rejected the additions.
- Round 6, 384 games: a stronger preference for nearby weak targets won 36/48 versus the incumbent's 35/48. More pressure on the public leader lost substantially (25–27/48). The one-game nearby gain was exploratory; the fresh 768-game confirmation above subsequently supported adoption.

- Round 7, 384 games: extra production before Fleets and stronger exchange buying lost (24–30/48 versus the old incumbent's 35/48). Higher draw preference tied at 35/48 and won the predeclared mean-points tiebreak, but did not increase wins. It remains unadopted and must face the new shorter-hunt incumbent in any confirmation.

- Round 8, 384 games: public one-volley tactic forecasts tied the predecessor at 31/48 at best; the predeclared mean-points tiebreak selected the worst-response model. It remains unadopted. A fixture that preserves another Fleet does not establish higher game win share.

- Round 9, 384 games: allowing only immediate favourable three-Fleet fights throughout the game won 39/48 (81.2%), versus the older production-first predecessor's 29/48. Allowing four throughout won 37/48. The fresh 96-map, 768-game confirmation above rejected that exact candidate. Combined targeting/raid hypotheses remain separate development work.

- Round 10, 384 games: combined nearby targeting and cohesive eight-Fleet groups selected a candidate at 37/48 versus the shorter-hunt incumbent's 33/48. The confirmation and subsequent route-correction comparison are reported above; the eight-Fleet change remains unadopted.

- Round 12, 768 games: five- and seven-Fleet caps tied at 73/96 wins. Five won the predeclared mean-points tiebreak (29.96 versus 29.72); the corrected incumbent won 70/96. The fresh 96-map paired confirmation above gave 271/384 versus 274/384 and rejected the change.

Raw win shares from different cohorts should not be read as paired comparisons. For example, the same earlier-opening source won 46.9% in one held-out cohort and 54.7% in the larger one.

## Recovery, verification and retention

In the initial production-first majority comparison, all **1,152 planned logical games** finished and passed source/trace/state/counter/RNG integrity checks, every-decision and whole-game resource accounting, production receipts, scoring reconciliation and the two-world/no-relic/no-unrelated-Prestige constraints. No planned seeds or losses were dropped.

The first execution hit ORCD's home inode quota. Its 305 physical attempts remain retained: 291 complete manifests and 14 partial journals. There were 282 completed, independently audited rows available to reuse; nine additional complete-but-unrecorded attempts and fourteen partial attempts were rerun. The recovery completed the remaining 870 logical tasks with identical frozen policies, tasks and RNG seeds. Count one final outcome per preplanned task, not both copies of a rerun. In total, 1,175 physical attempts are retained for this 1,152-game plan.

Lossless hard-link consolidation of identical frozen source files freed 24,285 inodes, verifying every source hash before and after; no game, manifest, trace, source path or source byte was pruned. A repeated original-policy game matched all 5,116 retained state/counter/RNG checkpoints. A genuinely partial selected-policy game matched its 4,092 retained checkpoints before extending to 4,256. The original job was `30416286`; recovery job `30417854` completed with exit `0:0` on `node1620`.

Reproduction identifiers:

- Original source commit: `af501e5759fc26002ea2a09036a1a4ef4371b01c`.
- Earlier production-first `app.js` SHA-256: `b1949d6b7ce86a57e8c043c6073a7ef374ca30993a5b5e8123ebe74d32bda3df`. That earlier promoted executable matched it exactly; the shorter-hunt executable is identified above.
- Validation protocol SHA-256: `e0303edf60728f6d992198f891fb99a2ecfaa6156b5f6f86ed5d405b9ce9492c`.
- Complete audited rows SHA-256: `e04cf9942c44af336d252ad7a12ef910395ac05d3915b4acc7cce0884c485c32`.
- Local study parent: `output/military-focused-improvement-20261125/`. The original validation is `run-validate-r4-48b9e2f60c`; recovery is `run-validate-r4-48b9e2f60c-recovery1`. Recovery retains `results/games.completed.jsonl`, `recovery-provenance.json`, `analysis/report.html`, `analysis/summary.json` and the exact analysis source/manifest. The original 282-row prefix and interruption inventory remain separate.
- Full histories: `/home/maxhays/galactic-reach-simulations/focused-run-validate-r4-48b9e2f60c/results/games/` and its `-recovery1` counterpart on ORCD. Every final row records its exact archive path. Full private positions, counters, actions/events and RNG follow the [simulation archive contract](../simulation-archives.md).
- All 672 histories from the first two development rounds are also retained in the locally downloaded and checksum-verified `focused-completed-r1-r2-20261125.tar.gz` bundle. After explicit user approval, the two expanded duplicate game folders were removed only after rechecking all 8,736 game files against this complete bundle and its independently checksum-matched copy on the compute system. Protocols/results remain expanded, and archive-location files point to the retained bundle members. No history was discarded.

Optimization continues at the user's request. A majority in this frozen test does not authorize merging the PR or changing the three opponent policies.

After a separate explicit approval conditional on local verification, four additional expanded duplicate game folders were removed. All **1,728 complete histories** remain in `focused-completed-r2validation-r3-r4dev-20261125.tar.gz`, verified locally and remotely against every one of its **22,611 files**; SHA-256 `043ae5df8b019f3c039a8dc944b755b528a6fa06739411d87c6ad3b5fd96ceeb`. A fresh remote verification also matched all 22,464 expanded game files before removal. Protocols/results remain expanded, each former game root has an archive locator, and `approved-next-copy-removal/` retains the authorization, terminal success, all removal events and checksum-verified evidence. No history was discarded.
