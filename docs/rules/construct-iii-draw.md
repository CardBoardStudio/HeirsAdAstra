# Construct III optional draw experiment

The player's change is defined in the canonical [Construct III rule](../../prototypes/galactic-reach/rulebook.html#construct-three-draw). The experiment asks whether an explicit draw-only alternative makes upgraded construction cards useful without forcing an unwanted build.

Only an original level III Construct gains the alternative. It enters play before drawing, uses the faction's Operations action, and ends the whole order. It does not open a second build. Normal construction still pays its ordinary cost, draws once after the first successful build, and offers the optional second build. Levels I/II and market construction cards do not gain this alternative.

Browser bots keep useful builds and scoring actions ahead of the fallback. They prefer Construct III over equivalent Construct II builds, and play draw-only before passing when there is a card in deck or discard. Native bots recognize the new command through an observation capability flag, so archived observations retain their previous action scores. Free and discounted builds retain priority over an equivalent full-price starter order.

## Fresh 30-point evaluation

The protocol was fixed before evaluation. Both arms use latest main `677efeb` plus behavior-preserving cache commit `f5620e8`. Candidate implementation is `2ce0c32`; later Rust formatting and compatibility-test changes do not change its JavaScript source.

Each arm has 384 fresh games: 16 new holdout setup seeds times every permutation of Military Builder, Military, Economy and Expansion across four seats. All 48 games for a setup seed use an identical map; there are 16 distinct maps. The bots know the target is 30 from setup. Military Builder retains the same construction/storage policy weights in both arms. This measures the combined new order and bot-support change, rather than a rule change with bots unaware of it.

| Profile | Previous rule | Draw-only + bot support | Paired change, 95% seed interval |
| --- | --- | --- | --- |
| Military Builder | 221/384 (57.6%) | 223/384 (58.1%) | +0.5 pp [-5.7, +6.8] |
| Military | 79/384 (20.6%) | 82/384 (21.4%) | +0.8 pp [-4.4, +6.0] |
| Economy | 66/384 (17.2%) | 62/384 (16.1%) | -1.0 pp [-5.5, +3.1] |
| Expansion | 18/384 (4.7%) | 17/384 (4.4%) | -0.3 pp [-3.6, +2.9] |

Military Builder remains strongest. None of the paired win-rate intervals excludes zero. The same winner appears in 196 of 384 matched games; individual trajectories often change despite similar aggregate shares.

Mean ending round falls from 19.86 to 18.85, a paired change of -1.02 rounds (95% interval [-1.44, -0.59]). Bots use the draw-only order 6.31 times per player-game overall: 8.56 for Military Builder, 4.93 Military, 5.83 Economy and 5.91 Expansion.

## Cards left in hand

Unused means normal-deck cards still in hand immediately before shared cleanup, divided by every card drawn into hand, pooled across player-rounds. Converted cards count as used. Gained cards enter the denominator only when drawn; separate combat tactic hands are excluded. Physical card identities and actual draw telemetry match exactly in every player-game.

| Profile | Unused before | Unused after |
| --- | --- | --- |
| Military Builder | 31.0% | 25.4% |
| Military | 29.3% | 24.8% |
| Economy | 28.7% | 24.1% |
| Expansion | 32.4% | 27.6% |
| All profiles pooled | 30.3% | 25.4% |

The after arm contains 217,615 draws and 55,351 cards left unplayed; the before arm contains 220,139 draws and 66,807 unplayed. Total draws can decline because the updated games finish sooner, even while draws per round increase.

No updated bot passed with Construct III while deck or discard contained a drawable card. The 7,473 copies left at pass all had empty draw piles. Later Buy purchases can refill discard; checking only the cleanup state would misclassify those as missed draws. This does not establish that every other unplayed card was unusable.

## Resources and investment

Military Builder still builds six Harvesters and averages 3.62 paid capacity upgrades, versus 3.55 Harvesters and 2.14 capacity upgrades for Military. Its final production averages 19.15 per round versus 13.50. The infrastructure advantage survives this change.

In updated games, bank receipts per player-game are 1.85 Biomass, 1.53 Matter, 0.25 Data and 0.21 Energy. Bots give the bank 6.85 Data and 4.76 Energy per player-game, compared with 2.27 Matter and 1.46 Biomass. These policies commonly seek Biomass and Matter while trading away Data and Energy. This is usage evidence, not a causal estimate of equal or unequal resource value; costs, production, storage and bank ratios all affect it. The result JSON preserves each resource's gains, spending, overflow and bank exchanges.

## Evidence and limits

The compact [results and protocol](https://github.com/CardBoardStudio/galactic-reach-studies/blob/main/construct-iii-draw-30-2026-11-15/results.json) retain exact source hashes, seeds, lineups, uncertainty, player metrics and resource totals. Raw games, frozen source, measurement harness, CSVs, HTML report and a replay runner are in the local output bundle `output/construct-iii-draw-30-2026-11-15/study.zip`.

All 768 games complete with no stalls or invented winners. Scores, resource ledgers, transfers, bank ratios, storage costs/capacity, level-I-only conversions and draw denominators reconcile. Instrumentation controls reproduce final state and RNG counts. The cache-only proof covers 3,551 per-decision states and RNG traces across four games from the current baseline. It agrees with the separate [cache evaluation](search-performance.md).

Intervals use 10,000 whole matched setup-seed bootstrap resamples. There are 16 independent setup blocks, not 768 independent maps. These games evaluate browser bot profiles; native Rust command support has a separate regression test. Bots are limited proxies for human strategy. Results should not be directly compared with older retrospective 40-point cutoffs, which used earlier main behavior and target-40 decisions.
