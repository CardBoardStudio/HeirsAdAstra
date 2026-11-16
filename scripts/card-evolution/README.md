# Card evolution study

A recurring, AI-only experiment that looks for good market cards and relics. It generates a batch of new cards, plays a few hundred all-rival games with them, keeps the best half of each pool, generates new cards for the other half, and repeats. The output is a **ranked shortlist with stats for the captain to choose from**. The study never edits the printed card set. Promoting a card is a manual, rules-reviewed change ([below](#promoting-a-shortlisted-card)).

## Run it

```sh
node scripts/card-evolution/run.cjs                       # defaults: working-tree rules, 5 generations x 200 games + 200 printed-card games
node scripts/card-evolution/run.cjs --config my.json      # merge a config file over default.config.json
node scripts/card-evolution/run.cjs --rules origin/main --generations 3 --games 100 --workers 8 --name quick
```

Each run writes a dated folder, `card-evolution-runs/<YYYY-MM-DD>-<name>/` (git-ignored; set `out` to write elsewhere). Start with `report.md`.

Runtime: one game takes 5–50 s of CPU. The runner plays games in parallel on `workers` threads (default: all cores but two), one engine context per thread. A thread that dies is replaced and its game replayed (`workerRestarts` in `run.json`). On an 18-core Mac, 6 × 200 games take about 40 minutes.

## Point it at a rules branch

`rules.ref` (or `--rules`) chooses which `prototypes/galactic-reach/app.js` and `adapter.js` the games run on:

- `"WORKTREE"` (default): the files in your checkout, including uncommitted edits. The report says when the engine had uncommitted changes.
- any git ref or commit, e.g. `"origin/codex/experiment-gr-tiered-market-m1"`, read with `git show`. Nothing is checked out.

To test several open rules PRs together, merge them into a local scratch commit without touching your checkout, then point the study at it:

```sh
git fetch origin
TREE=$(git merge-tree --write-tree origin/main origin/codex/experiment-a origin/codex/experiment-b)
git branch -f scratch/card-evolution $(git commit-tree "$TREE" -p origin/main -p origin/codex/experiment-a -p origin/codex/experiment-b -m "scratch: card-evolution integration")
node scripts/card-evolution/run.cjs --rules scratch/card-evolution --name stacked
```

Do not push the scratch branch. Put the PRs and commits it contains in `rules.description`; the report prints it next to the commit.

The study patches the engine in memory at five fixed spots (rival-only seats, two catalog swaps, the headless port, the metrics hooks). If the engine changes one of them, the run stops with `card-evolution engine patch not found: <spot>`; update `engine.cjs`. `node scripts/test-card-evolution.cjs` checks that the patches still apply and that swapping in the printed catalog plays the same game as the unpatched engine.

## What it does

1. **Baseline (G0).** `baselineGames` games with the printed cards, as a reference for what pick rates and lifts a real card gets. Not part of the evolution.
2. **Generation 1.** A fully generated pool the size of the printed one: 31 market designs (two copies each, as printed) and 15 relics. Market cards fill **role quotas** (`pool.market.roles`) and **price-tier quotas** (`pool.market.tiers`: Expensive 8+, Medium 6–7, Cheap ≤5, the tiered-market split); relics fill **affinity quotas**.
3. **Play** `gamesPerGeneration` games. Every seat is the browser rival. Game *i* always uses seed `seed + 7919·i` and the same profile lineup (a duplicated profile plus military, economy and expansion, rotated), so generations differ only in their cards.
4. **Score** every card within its pool (see [scoring](#scoring)).
5. **Select.** Keep the top `keepFraction` of each pool by score, skipping dominant cards and keeping at most `maxRoleShare` of the kept cards in one role.
6. **Refill** to the quotas: `mutationShare` of the new cards are one-field variants of the best survivors (e.g. +1 range, a different discount, ±1 attack), the rest are fresh cards for the role and tier furthest below quota.
7. Repeat for `generations`; then write the report.

### The generator

`generator.cjs` composes cards from rule fields the engine already resolves, so a generated card needs no new code:

| Role | Order | Fields |
| --- | --- | --- |
| Movement | move | `range`, `pathfinder`, `assault` |
| Industry | construct | `buildDiscount` (`each`/`free`), `secondBuild`, `buildGain` |
| Expansion | colonize | `colonyCost`, `keepSettler`, `colonyPrestige` |
| Deckcraft, Capacity, Economy, Prestige | special | `effect`: `draw`, `trashStarters`, `limits`, `trashSelf`, `produce`, `gain`, `prestige` |
| Buy | – | `buyEffect` (`discountEach`/`hubDiscount`) |
| Wonder | – | `gainPrestige` |
| Military | tactic | `attack`, `shield`, `pierce`, `victoryPrestige`, `loot` |
| Relics | any of the above, or a reaction | `reaction` (`prevent`/`targeting`), `strength`, `requiresFleet` |

Price comes from a power model fitted to the printed market (every printed normal-deck card is reproduced within 1 resource; the test checks this) times a random markup of ±`generator.markup`. Costs keep the printed shape: a card above the starting limits costs 5+ of one resource, and a card of total 4 or less fits the starting limits. Relics have no price; their power is held between 6 and 11, the range of the printed field-based relics. Text is generated from the same fields in the catalog's wording, so it always matches the effect. Names come from per-role word lists and never repeat a printed name.

### Scoring

One *seat* is one faction in one game.

| Stat | Meaning |
| --- | --- |
| offers | Market: Buy turns in which the design was face up for that faction. Relics: excavations with the relic in the row. |
| pick rate | Copies bought (relics: times chosen) ÷ offers. Market pick rates are small (~2–6%) because a rival buys about one card per four Buy turns from 9–10 face-up cards. |
| buyer / non-buyer win | Win rate of seats that bought it vs. seats offered it that passed, finished games only. 25% is par. |
| lift | Smoothed (8 pseudo-seats at 25%) buyer win rate − non-buyer win rate. |
| adj. lift | Lift − the pool's median lift. Strong factions buy more of everything; only the excess is credited to the card. |
| score | `pickWeight`·z(pick rate) + `winWeight`·z(adj. lift), z-scored within the generation's pool. Cards with fewer than `minOffers` offers score 0. |
| dominant | ≥ `minBuyerSeats` buyers, buyer win ≥ `buyerWinRate` and adj. lift ≥ `liftOverPool`. Flagged as overpowered: dropped from the pool, listed separately, never shortlisted. |
| plays/copy | Times a bought copy was used: an order, a Buy effect, a reaction or a battle tactic. Near 0 means the rival buys it but cannot use it. |

The shortlist ranks generated cards by **career score**: the sum of a card's generation scores ÷ (generations it played + 1), so a card that kept scoring across generations outranks a one-off. It requires `shortlist.minBuyerSeats` buyers and caps each role at `maxRoleShare` of the list.

### Output files

| File | Contents |
| --- | --- |
| `report.md` | Trends per generation, ranked market and relic shortlists, dominant cards, final pool, printed-card reference, caveats. |
| `shortlist.csv`, `shortlist-cards.json` | The shortlist as a table, and the shortlisted cards' rule fields. |
| `generations.csv` | One row per card per generation with every stat. |
| `gen-<n>/pool.json`, `games.jsonl`, `cards.csv`, `cards.json`, `selection.json` | The pool, every game record (seed, lineup, winner, rounds, per-seat offers/buys/plays/relic picks), card stats, keep/drop decisions. |
| `config.json`, `run.json` | The resolved config; rules ref and commit, study commit, wall times, summaries. |

## Read the results with care

- **AI-policy bias.** The rival values cards by draws, Prestige, limits, order type and military power. It does not price range, assault, build discounts, colony terms, production or gains individually. A strong card the rival undervalues looks weak; a card the rival overvalues looks popular. Pick rate means "the rival wants it".
- **Correlation, not causation.** Lift compares buyers with non-buyers of the same game; the median adjustment removes the average "rich factions buy more" effect, not card-specific selection.
- **Noise.** About 200 games give each design a few hundred offers but only tens of buyer seats. Trust cards that stayed near the top for several generations.

## Promoting a shortlisted card

Promotion is a normal rules change, decided by the captain, never by the study:

1. Pick a card from `report.md`. Its rule fields are in `shortlist-cards.json`.
2. Branch from `origin/main` as a rules experiment (`codex/experiment-<short-name>`). Add the card to `ADVANCED_CARDS`, `MARKET_MILITARY` or `RELIC_CARDS` in `prototypes/galactic-reach/app.js` with a new printed code (`N30`, `M11`, …) and a stable camelCase key. Keep `tag` equal to the key for move, construct and colonize cards. Drop the study-only fields `origin` and `power`; rewrite the name and text if needed.
3. Follow `AGENTS.md`: update the rulebook card tables (`#cards`, and `#market-tiers` if tiers exist) in the same PR, add a `changes/<branch>.md` entry with `compat: breaking`, label it `playtest-breaking`, and add or extend a behavior test.
4. Re-run the study on the branch (`--rules` your branch, `baselineGames` > 0) to see the promoted card among the printed ones.

## Files

- `run.cjs`: CLI, worker pool, generation loop, selection and refill.
- `engine.cjs`: loads and patches the engine, plays one game, records metrics.
- `generator.cjs`: roles, power model, cost shape, text, names, variants.
- `scoring.cjs`: per-card stats, scores, dominance, survivor selection.
- `report.cjs`: `report.md`, shortlist files.
- `default.config.json`: every setting, with the defaults above.
- Test: `node scripts/test-card-evolution.cjs` (about 15 s).
