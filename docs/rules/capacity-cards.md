# Capacity Cards (31.36 experiment)

**Request.** The captain asked on 2026-11-14 for a large new card set to try against the AI while shared multiplayer is built. Strong cards should cost more than you can hold at first, so you raise your capacity to reach them. The market should hold 10 cards, mixing normal-deck and military-deck cards. The Prestige target should be a table setting, 40 for this test. After playing, the captain will say which cards they liked, by name or id.

**Rule** ([#capacity-cards](../../prototypes/galactic-reach/rulebook.html#capacity-cards), [#buy](../../prototypes/galactic-reach/rulebook.html#buy), [#military-deck](../../prototypes/galactic-reach/rulebook.html#military-deck), [#cards](../../prototypes/galactic-reach/rulebook.html#cards), [#victory-target](../../prototypes/galactic-reach/rulebook.html#victory-target), [#rival-cards](../../prototypes/galactic-reach/rulebook.html#rival-cards)):

- Every earlier advanced card leaves the market. 36 new designs replace them: 26 normal-deck cards (`N01`–`N26`) and 10 military cards (`M01`–`M10`), two copies of each. Every card costs more of at least one resource than the starting limit of 4.
- Prices run from 6 total (Ion Thrusters: 5 Energy, 1 Data, which needs one capacity upgrade) to 22 (Dyson Lattice: 12 Energy, 6 Matter, 4 Data, which needs several).
- Move and Construct are no longer sold. The six starters stay as they are, with Move II / Construct II upgrades, and remain how you build early capacity. **No starter tweak.**
- The market shows 10 face-up cards from one shuffled 72-card supply. A bought normal card enters discard. A bought military card joins the new **military deck**. That deck is never drawn: each battle, every military card you own is one extra tactic beside the four basic tactics, usable once per battle.
- New Prestige source, **card Prestige**: Wonders (N23–N25) when bought, Ascendancy Codex per use, Genesis Charter per Colony it founds, and Victory Doctrine per decisive win it was used in.
- The Prestige target is chosen when a game is created: in the waiting room (`gr_lobbies.victory_target`, additive column) or in the guest New game dialog. The choices are 20, 30, 40, 50 or 60, and 31.36 defaults to 40. It is saved as `state.victoryTarget`. Other win rules are unchanged.

**Card design.** Price is the main power signal, and rivals read it that way. Each functional group has a cheap card, a mid card and a top card:

| Group | Cards (cheap → top) |
| --- | --- |
| Movement | Ion Thrusters, Slipstream Charts, Strike Vector, Fold-Space Gate |
| Construct | Prefab Yards (−1 each), Orbital Foundry (−1 each, +2 Matter), World Engine (free) |
| Colonize | Seed Ark (1 Biomass), Colony Pods (keeps the Settler), Genesis Charter (free, keeps the Settler, +2 Prestige) |
| Economy | Mining Charter, Bio-Reactor, Data Haven, Harvest Cycle, Quartermaster |
| Deck | Archive Purge (trash 2 starters), Strategy Core (draw 3), Command Nexus (draw 4) |
| Capacity | Cargo Expansion (+1 every limit, reusable), Hyperspace Vaults (+2 every limit) |
| Buy | Trade Syndicate (−1 each on the next purchase), Procurement Hub (+1 purchase) |
| Prestige | Monument of Accord 3, Galactic Senate Seat 4, Dyson Lattice 6, Ascendancy Codex 2 per use |
| Military | Rail Battery, Deflector Grid, Flak Screen, Boarding Marines, Torpedo Spread, Hardlight Bulwark, Phase Lance (ignores shields), Nova Barrage, Aegis Lattice, Victory Doctrine |

Card definitions live once, in `ADVANCED_CARDS` and `MARKET_MILITARY` in `prototypes/galactic-reach/app.js`. The rulebook tables were generated from them. The card gallery reads them through `createGalacticReach({catalog:true})`.

**Rivals.** `aiBuyValue` scores a card at 10 plus its price, plus 5 per printed Prestige point (Codex counts ×3 for reuse), plus 8 for the profile's favored kinds. It subtracts 8 per copy already owned and penalizes decks of 18+ cards. Military cards need a Fleet unless the profile is Military. The best card is the rival's target (`aiTargetCard`):

- `aiReserves` saves toward its price, up to current limits, plus the next capacity price.
- During Buy, after any starter upgrade, `aiCapacityForTarget` buys up to two capacity upgrades aimed at the target's over-limit resources.
- The rival then buys the best card it can pay for, using the bank if needed.
- Prestige, capacity and draw-three orders are played first. Battle tactics are scored by printed hits, shields and pierce.

Native policy 26, which plays shared-table rivals (#45) and arena seats, gains a static table of the 36 cards (`CAPACITY_CARDS`, generated from the catalog) and of military tactic stats (`CAPACITY_TACTICS`). It scores a buy at 70 + price + 5 × Prestige − 8 per owned copy (military only with a Fleet), buys capacity during Buy aimed at its best market card's over-limit resources, plays Prestige, capacity and draw orders first, scores tactics by printed hits/shields/pierce, and stops planning storage at the table's `victoryTarget` instead of a fixed 20. Those branches fire only on 31.36 card keys or a 31.36 observation, so the policy stays version 26 and earlier rules play identically. `reference_policies_buy_and_play_capacity_cards` checks a full native 31.36 match: 42 new cards bought, 21 capacity upgrades, 55 new-card plays and military tactics used. Shared tables store the waiting room's target (`gr_shared_tables.victory_target`, additive) and pass it to the engine.

**Issue #41.** Its rebalancing targets (Settler Biomass, Harvester outputs, starting resources) are not addressed here. The new prices make early Data and Energy shortages matter less, because no card is buyable before a capacity upgrade anyway, but Settler and Harvester costs are untouched. #41 stays open.

**Versioning.** This is `playtest-breaking`: card contents, market, combat tactics, scoring and saved state all change.

- New games use **save format 31, rules 36** (`galactic-reach/31.36`, "Capacity Cards experiment") and `-v31` browser keys.
- The exact 30.35 browser, manual and engine (base branch `c105bb3`) are archived as `crates/galactic-reach/rules/v30-*`, served at `/galactic-reach/rules/30.35/` and pinned in `scripts/capacity-cards-archive-hashes.json`.
- 30.35 tables, replays and `with_rules` use that archive. There is no migration.

**Feedback.** `/galactic-reach/cards.html` lists every card with its id, price, the limit it needs, conversion and effect. A like/dislike/neutral vote and note per card save in the browser and, when the host sets `CARD_FEEDBACK_PATH`, are appended as JSON lines to that file (`crates/server/src/card_feedback.rs`, `POST /api/galactic-reach/card-feedback`). A copy-all text export covers hosts without storage. Public previews store nothing server-side.

**Checks.**

- `scripts/test-capacity-cards.cjs` checks: ids and prices; the 10-card mixed market and 72-card supply; the purchase gate; military-deck and Wonder purchases; both Buy cards; one-step orders; printed Construct discounts; rival capacity targeting; and a full four-rival game reaching 40.
- `scripts/test-tactical-combat.cjs` checks: military cards in the tactic hand, Phase Lance pierce, loot, and Victory Doctrine Prestige.
- `scripts/test-single-use-orders.cjs` checks colony cards. `scripts/test-in-play.cjs` checks Archive Purge, the 30.35 archive and routing.
- `scripts/test-galactic-reach-dialogs.cjs` checks the target dialog. Server tests cover the waiting-room target and feedback storage.
- Behavior of removed cards (Trade Consortium, Salvage Crews, Emergency Jump and others) is still checked against the 30.35 archive.

**Simulation.** Four browser rivals finished 6/6 sample games at 40 Prestige in 29–49 rounds (mean 36). Every rival bought capacity (2–6 upgrades) and 5–20 cards; winners held 17–25 card Prestige. This is a smoke sample, not a balance study.
