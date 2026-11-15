# Strategic rivals: 37.42 balance study

All **384 games completed**. Updated browser rivals won **125 of 192 mixed games (65.1%)** against baseline rivals, with two of each policy per game. The other 67 games went to baseline rivals. A setup-seed cluster bootstrap gives a descriptive 95% interval of **51.6–75.5%**. One seed favored the old policy, so the improvement is not universal.

## Strategy balance

| Profile | Old-policy win share (96 games) | Updated-policy win share (96 games) | Updated mean points | Updated mean Colonies | Updated mean combat victories |
| --- | ---: | ---: | ---: | ---: | ---: |
| Military | 31/96 (32.3%) | 38/96 (39.6%) | 30.2 | 3.09 | 7.07 |
| Economy | 33/96 (34.4%) | 42/96 (43.8%) | 30.0 | 3.17 | 4.85 |
| Expansion | 32/96 (33.3%) | 16/96 (16.7%) | 23.9 | 3.45 | 2.79 |

Economy and Military remain close; Expansion falls behind. The existing scoring rules reward captures and decisive fights, and updated defenders now contest the expansion route. These are results for three heuristic profiles, not proof that optimal human expansion is weak. Further tuning should examine escorts, capture timing and how much defense diverts the Expansion profile before changing human scoring.

The old and updated self-play games finished in 24.93 and 25.51 rounds on average. Updated self-play seat wins were 26/20/26/24, compared with 22/27/32/15 before. The rotated study does not show the earlier large seat skew under the updated policy.

## What changed in bot play

| Mixed-game measure, per seat | Baseline | Updated |
| --- | ---: | ---: |
| Final points | 26.83 | 30.96 |
| Cards drawn | 169.11 | 244.82 |
| Level III starters at the end | 0.00 | 5.88 |
| Market purchases | 13.65 | 3.85 |
| Colonies at the end | 2.78 | 3.71 |
| Decisive combat victories | 2.91 | 5.14 |

In updated-only matches, 362 of 384 seats (94.3%) ended with all six starters at III. This corrects the report’s concrete blind spot. Fewer purchases and more drawing show a shift toward smaller draw engines; they do not establish that every rejected card is weak. Average market purchases fell sharply, so a future card study should also inspect effects that these heuristics undervalue.

## Resource balance

Updated-only games, averaged per player over a full game:

| Resource | Gross gains | Recorded spending | Overflow | Overflow / gains | Given to bank | Received from bank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Matter | 147.80 | 81.55 | 53.34 | 36.1% | 4.69 | 2.50 |
| Energy | 94.57 | 56.16 | 23.83 | 25.2% | 6.61 | 0.66 |
| Biomass | 78.81 | 44.73 | 24.13 | 30.6% | 3.45 | 2.08 |
| Data | 78.58 | 39.20 | 23.17 | 29.5% | 8.28 | 0.52 |

Matter and Biomass are the most frequently imported resources. Energy and Data are more often traded away. This differs from the human report’s Biomass surplus and is consistent with these bots commissioning and replacing Fleets. Resource usefulness is strategy dependent; equal importance is not demonstrated.

Overflow is substantial for every resource. Part of it comes from converting III cards for their draw even when the resource gain is capped. Consequently, overflow alone does not measure harmful waste or justify raising storage limits.

Gross gains include resource additions from production, cards and conversions, excluding starting reserves and bank receipts. Recorded spending includes construction, card purchases, capacity and starter upgrades; bank payments are separate. Direct trash payments and player-to-player transfers are not included in the spending measure. These flows are diagnostics, not marginal resource values or a conservation ledger.

## Method and reproducibility

- Baseline: `45b3a4057e879c65ec77eed2b5e2ce349445e1cc`.
- 40 Prestige; eight held-out setup seeds beginning at 910701, incremented by 7919.
- Each profile is duplicated in turn; all four seat rotations. Each profile gets 128 seats in each 96-game self-play batch.
- 96 baseline games, 96 updated games and 192 mixed games. Mixed assignments use complementary two-old/two-new masks for every setup, lineup and rotation.
- All assignments within a seed have the same initial map hash. There are eight distinct maps, with randomized terrain, moons and card shuffles; worlds retain the approved geometry.
- The actual solo browser decision functions run headlessly. The only policy guard lifted lets seat zero be a computer. Mechanics, prices, combat choices and RNG are preserved. Policy switches resume the same authoritative snapshot and continue one RNG stream.
- Identical-policy control matches produce identical outcomes and accounting with or without seat handoffs. Telemetry also preserves setup and RNG.
- Caps: 50 rounds and 12,000 driver steps, with no invented winners. All games finished within both caps.
- Pilot seeds 720001–720003 were excluded from the final estimate. No browser-policy parameters were tuned after the held-out run started.
- Cluster intervals resample whole setup seeds 10,000 times; eight independent setups still give limited coverage. The 384 games are not 384 independent map samples.
- These figures describe **browser bots**, matching the supplied report. Native server policy 29 was updated and has separate behavioral/compatibility tests; it is not being represented as the same measured policy.

Run from the repository root:

```sh
node scripts/strategic-bot-study.cjs --seeds 8 --seed-start 910701 --workers 4 --out analysis/strategic-bots-results
```

The protocol records exact engine/adapter source hashes. `games.jsonl` contains all final outcomes and player/resource metrics; `outcomes.csv` is the compact outcome index; `summary.json` and `uncertainty.json` contain aggregated results. The simulation driver is single-study code, not a changed human ruleset.

## Assessment

The bots are stronger against their predecessors and the III-upgrade problem is fixed. The updated profiles are **not balanced**: Expansion needs further investigation. Matter/Biomass pressure, excess conversion resources, and selective late-game buying remain useful targets for the next study. No human costs, scoring, map generation, or relic effects were changed for this experiment.
