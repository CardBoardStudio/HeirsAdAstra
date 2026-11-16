# Tiered market

Player rules: [rulebook `#market` and `#market-tiers`](../../prototypes/galactic-reach/rulebook.html#market-tiers). This note records the split, the empty-deck decision and the balance check.

## The rule

The 62 market cards (two copies of 31 designs) form three decks by **total printed price**, the sum of every resource in the cost. Each deck has three face-up slots, so the market shows nine cards instead of ten. Rows are listed in table order, below the relic row: Expensive, Medium, Cheap.

| Tier | Total price | Designs | Cards |
| --- | --- | --- | --- |
| Expensive | 8+ | Fold-Space Gate, World Engine, Genesis Charter, Command Nexus, Hyperspace Vaults, Monument of Accord, Dyson Lattice, Ascendancy Codex, Phase Lance, Nova Barrage, Aegis Lattice, Victory Doctrine | 24 |
| Medium | 6–7 | Strike Vector, Colony Pods, Strategy Core, Archive Purge, Cargo Expansion, Procurement Hub, Trade Syndicate, Flak Screen, Torpedo Spread, Hardlight Bulwark | 20 |
| Cheap | ≤5 | Ion Thrusters, Slipstream Charts, Prefab Yards, Seed Ark, Signal Relay, Survey Network, Tactical Briefing, Rail Battery, Deflector Grid | 18 |

Why these thresholds: current totals are 3, 5, 6, 8, 9, 10, 11 and 14, and no card totals 7. Cheap is the three draw-two cards plus every card priced at exactly 5 of one resource. Medium is exactly "5 of one resource plus 1 of another". Expensive is every larger or more mixed price. The 9/10/12 split is as even as the price gaps allow: moving the line to 6 would put 19 designs in Cheap, and moving it to 10 would leave 5 in Expensive. The two-copies rule stays; it does not break any tier. A card's tier comes from `marketTier(key)` in `app.js`, so a later price change moves the card automatically. Printed discounts change what a buyer pays, not the tier.

## When a tier deck runs out

The slot stays empty. Nothing moves in from another tier.

Why: it is the simplest rule to state and to see. Each row keeps one meaning ("these cost 5 or less"), a buyer never has to work out which deck refills a slot, and no new reshuffle or cross-tier order has to be logged at shared tables. The old one-deck market also shrank when its supply ran out. In the batch below, only the Cheap deck ever ran out, in 9 of 32 games, between rounds 23 and 28 of 23–41-round games, so the rule affects only the end of a game. Refilling from the next tier is the fallback if playtesters dislike late empty Cheap slots.

## Implementation

- State: `marketDecks` (`{expensive, medium, cheap}`, each a shuffled deck) replaces `advancedDeck` and the unused `marketDiscard`. `market` stays one flat array in row order, so legal `buy` actions, shared-table commands (`{type:'buy', source:'market', index}`), the observation (`market`, `marketCosts`, `marketPrestige`) and the native policy keep their shapes.
- A purchase replaces the bought card in place with the top of its own tier's deck (`buyCard`), so the other slots do not move. `fillMarket` deals the opening three per tier in row order.
- Shared tables: setup asks the authority for three shuffles (`market-deck:expensive`, `market-deck:medium`, `market-deck:cheap`) instead of one `market-deck`. `privateState` hides each deck's order and keeps its size, and `undoMark` still counts cards left across all three decks, so a refill stops Undo and an empty slot does not. Tables already dealt keep their engine (the `compat: breaking` entry starts a new dev revision); a browser save without `marketDecks` is not loaded by this engine.
- Rivals: browser and native rivals already value each face-up card on its own and buy by index, so neither policy needed a change. The rulebook's rival section says so.
- Presentation: `renderMarket` lists the rows Expensive, Medium, Cheap and fills an empty slot with a "Deck empty" placeholder, so each row keeps three positions. Layout (rows of three, relics on top) belongs to the layout follow-up PR.

## Balance check

Four browser rivals (the standard lineup, every seat played by the rival policy, 40-Prestige target) on the same 32 seeds, current market against the tiered market. Purchases are grouped by the tiers above in both runs.

| | Current (one deck, 10 cards) | Tiered (3 × 3) |
| --- | --- | --- |
| Games finished | 32/32 | 32/32 |
| Rounds, mean ± sd (median, range) | 27.3 ± 4.0 (28, 15–36) | 26.9 ± 5.0 (28, 18–41) |
| Cards bought per game | 22.6 | 19.8 |
| Expensive / Medium / Cheap per game | 9.1 / 6.1 / 7.4 | 4.9 / 4.8 / 10.1 |
| Share of purchases | 40% / 27% / 33% | 25% / 24% / 51% |
| Games where a tier deck ran out | 0 | 9 (Cheap only, rounds 23–28) |
| Winning profile (economy / military / expansion) | 19 / 10 / 3 | 12 / 17 / 3 |
| Capacity purchases per faction | 3.31 | 3.01 |

Reading: game length is unchanged. Fewer Expensive cards are on offer at once (always 3, against about 4 of 10 before), and a bought Cheap card is always replaced by another Cheap card. Rivals buy about half as many Expensive cards and more Cheap ones, and total purchases fall about 12%. Military won more often (17 against 10). One possible cause is that Rail Battery and Deflector Grid now stay among the few Cheap choices, but 32 games cannot separate that from noise. Watch both in playtests. The harness and raw results are kept outside the repository with the task's proof; this is a smoke study, not a tuned balance pass.
