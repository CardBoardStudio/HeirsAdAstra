# Strategic rivals: current-rules results

All **288 games completed** under the current unknown-only Probe and unlimited-purchase rules. In the 192 mixed games, two updated rivals faced two baseline rivals. Updated rivals won **131/192 (68.2%)**. A bootstrap that resamples whole setup seeds gives a descriptive 95% interval of **53.6–81.8%**. Eight independent setups give limited coverage; the 288 games are not 288 independent map samples.

## Strategy balance

The 96 games using only updated rivals had equal exposure for each strategy: each profile was duplicated in turn, then rotated through all four seats. Each profile occupied 128 seats. The percentages below are shares of all 96 wins, so equal performance would give each profile one third of the wins.

| Profile | Wins | Share of wins | Mean final points | Mean Colonies | Mean combat victories |
| --- | ---: | ---: | ---: | ---: | ---: |
| Military | 41 | 42.7% | 31.31 | 3.13 | 6.99 |
| Economy | 39 | 40.6% | 30.37 | 3.08 | 4.13 |
| Expansion | 16 | 16.7% | 24.91 | 3.48 | 2.69 |

Military and Economy are close in this sample. Their win-share difference is only 2.1 percentage points; the seed-cluster interval is −15.7 to +19.8 points. Expansion still trails despite ending with more Colonies on average. These are three heuristic profiles, not optimal human strategies. The next investigation should examine Expansion's escorts, capture timing, scoring-card choices and defensive diversion before changing human scoring.

Updated-only games lasted **24.03 rounds** on average. Seat wins were **26/17/26/27**. That remaining variation warrants monitoring; this sample does not establish equal seat strength.

## What changed in bot play

| Mixed-game measure, per player | Baseline | Updated |
| --- | ---: | ---: |
| Final points | 26.85 | 31.55 |
| Cards drawn | 159.52 | 235.58 |
| Level III starters at the end | 0.00 | 5.82 |
| Market purchases | 16.24 | 8.16 |
| Colonies at the end | 2.73 | 3.75 |
| Combat victories | 2.48 | 4.91 |

In updated-only games, **358/384 players (93.2%)** finished with all six starters at III. The upgrade blind spot is fixed. The new rivals buy fewer cards and draw more, favoring a smaller draw engine over indiscriminate purchases. Purchases remain legal without a per-turn cap. The evaluation uses actual printed effects, relevance to the board, deck redundancy, affordable bank exchanges and resources reserved for scoring or defense. These outcomes do not prove that every rejected card is weak.

The combined policy is stronger against its predecessor. This study does not isolate how much improvement came from upgrades, defense or card selection individually.

## Resource balance

Updated-only games, averaged per player over a full game:

| Resource | Gross gains | Recorded spending | Overflow | Overflow / gains | Given to bank | Received from bank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Matter | 144.13 | 85.62 | 44.66 | 31.0% | 4.86 | 2.05 |
| Energy | 93.59 | 61.35 | 18.11 | 19.4% | 6.03 | 0.66 |
| Biomass | 78.82 | 46.61 | 22.26 | 28.2% | 3.38 | 2.08 |
| Data | 77.91 | 44.98 | 18.08 | 23.2% | 7.15 | 0.56 |

All four resources are used substantially, but equal marginal usefulness is **not demonstrated**. Matter and Biomass are imported most often. Energy and Data are more often exchanged away. Matter has both high spending and high overflow, suggesting mismatches in timing or storage rather than a simple lack of uses. Expansion spends more Biomass than the other profiles (52.04 versus 41.34 for Military and 46.47 for Economy), showing that demand depends on strategy.

Overflow includes intentional conversion of III cards for their draw even when their resource gain is capped. It is not all harmful waste. Gross gains include production, cards and conversions, excluding starting reserves and bank receipts. Recorded spending includes construction, purchases, capacity and starter upgrades; bank payments are separate. Direct trash payments and player-to-player transfers are excluded from recorded spending. These flows are diagnostics, not marginal values or a complete conservation ledger.

## Method and reproducibility

- Baseline: `d3e3ab6a672e330aa3a69eddd9c2d5b537ab76fa`. Both policies play its current human rules, including unlimited affordable purchases.
- Tested updated engine/adapter source: `e25df575e4ad924bc8dc5541bdf9c5d6a5952aec`; exact combined source hashes are in `protocol.json`.
- 40 Prestige; eight setup seeds beginning at 910701, incremented by 7919. Each profile is duplicated in turn; all four seat rotations.
- 96 updated-only games and 192 mixed games. Mixed assignments use complementary two-old/two-new masks for every setup, lineup and rotation.
- Every assignment within a seed has the same initial map hash. There are eight distinct maps, with randomized terrain, moons and card shuffles; worlds retain the approved geometry.
- The actual solo browser decision functions run headlessly. The only policy guard lifted allows seat zero to be a computer. Policy switches resume the authoritative snapshot and continue one RNG stream. No mechanics, costs, scoring or random outcomes are substituted.
- Identical-policy control games preserve outcomes and accounting across policy handoffs. Telemetry preserves setup and RNG.
- Caps: 50 rounds and 12,000 driver steps, with no invented winners. All games finished within 41 rounds and 1,488 steps.
- Pilot seeds 720001–720003 were excluded. No strategy parameters were tuned using the held-out outcomes. A bank-payment correctness fix was found by CI, and the partial pre-fix run was excluded and restarted in full.
- Descriptive intervals resample whole setup seeds 10,000 times, with random seed 63742. `uncertainty.json` includes per-seed estimates.
- These results measure **browser rivals**, matching the human report. Native policy 29 was also updated and tested separately; it is not represented as the same measured policy. Native policy 28 and published historical engines remain available.

From the tested PR checkout, run:

```sh
node scripts/strategic-bot-study.cjs --baseline d3e3ab6a672e330aa3a69eddd9c2d5b537ab76fa --seeds 8 --seed-start 910701 --modes updated,mixed --workers 4 --out analysis/strategic-bots-results
```

`games.jsonl` contains complete outcomes and player/resource metrics. `outcomes.csv` is the compact outcome index. `summary.json` and `uncertainty.json` contain aggregates. `sha256.json` records bundle checksums. The superseded one-purchase study is retained [separately](../strategic-bots-before-unlimited/README.md); its numbers are not the current assessment.

The bots are stronger, but the profiles are **not balanced**. Expansion and the timing of Matter/Biomass demand remain the clearest follow-up targets. This experiment changes computer decisions, not human prices, scoring, setup or card effects.
