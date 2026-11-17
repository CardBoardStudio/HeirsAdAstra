# Tutorial: Learn to play, and on-table guidance

Status: **implemented for 38.43** (`prototypes/galactic-reach/tutorial.js`, `guide.js`, `guide.css`). Players read about both in the rulebook's [Learn to play](../../prototypes/galactic-reach/rulebook.html#learn-to-play) and [Guidance](../../prototypes/galactic-reach/rulebook.html#guidance) sections.

## Two layers

**Guidance** runs in every solo and shared game unless the player switches it off (Guidance in the game menu; stored in `localStorage` `galactic-reach-guide-v1`). On each of your turns it shows one note about one element: the card to use, the lit hex, the affordable supply card, or Pass & buy / Finish Buy. That element gets a cyan ring, a gentle bounce (a still glow for reduced motion) and an arrow; a destination the note names (the Data hex, the nearest free world) gets a dashed ring. Notes call cards cards ("Construct card") and say what to do this turn: cards left in hand are discarded at Cleanup, only resources carry over. The opening it suggests is a Data Harvester, then a Shipyard. The first time a mechanic matters (first Operations turn, Buy turn, Shipyard, Colonize or Probe card, located relic, full resource, Capacity Module, battle, half the Prestige goal), it explains that rule once, with a rulebook link, and remembers that it did. It reads the table through `guidePort()` in `app.js`: the same questions the hand, Sector Scan and market ask (`availableContextOrders`, `canAfford`, `purchaseCost`, …). It never changes the game.

**Learn to play** (`index.html?tutorial=1`) is a seeded game in which the three rivals pass every turn. It drives the same coach mark through fixed lessons. Each step names its anchor element, its rulebook section and a predicate on the game state. The tutorial advances only when the player's own action has made that predicate true, never on a Next click. Alternative solutions count when they meet the objective (for example, dragging the card instead of choosing Use order).

## Lessons

| Lesson | The player does | Rulebook | Advances when |
| --- | --- | --- | --- |
| Read the table | Opens their score breakdown, selects their Colony, closes the Sector Scan | `#shared-board`, `#victory` | Breakdown opened and closed; Sector Scan opened and closed |
| Resources | Converts a Construct, then a Move | `#player-mat`, `#resources` | Matter, then Energy, rose |
| Orders | Uses a Construct card's order on the Data hex next to the Colony and builds a Data Harvester (2 Data a round: Explorers, excavation, upgrades) | `#orders`, `#building` | A Harvester exists |
| The round | Passes, finishes Buy, inspects the deck after Cleanup & draw; is told that unused cards are discarded and resources carry over | `#round`, `#buy`, `#cleanup-draw`, `#deck-inspection` | Passed; the round advanced; deck window opened and closed |
| Ships | Builds a Shipyard, then commissions a Settler and an Explorer (one Construct card each, one per turn) | `#building` | A Shipyard, then each unit, exists |
| Movement | Splits a move (Fleet without the Settler), then moves the Explorer alone; a Fleet is supplied, with its price | `#split-moves`, `#movement` | The Fleet, then the Explorer, left the Shipyard |
| Relics | Probes, flies to the ◈, excavates and chooses a relic card | `#movement`, `#excavation`, `#alien-relics` | A relic is located, reached, then excavated |
| Colonies | Moves the Settler onto a neutral world's center and founds a Colony | `#orders` | The Settler is on the center; one more Colony |
| The bank | Trades 4 Energy for 1 of another resource on the mat | `#trade` | That resource rose |
| Your Buy turn | Passes; buys a market card; upgrades a starter; buys a Capacity Module; trashes a card; finishes Buy | `#buy`, `#market-tiers`, `#capacity-module` | Each purchase, upgrade or trash is seen; the round advanced |
| Capacity | Plays the Capacity Module and splits its 4 points | `#storage-allocation` | The Storage pile holds a module |
| Combat | Moves the Fleet onto a stray rival Explorer and picks tactics | `#combat`, `#combat-tactics` | A decisive victory is recorded and its report closed |
| Winning | Opens the score breakdown | `#victory`, `#victory-target` | Breakdown opened and closed |

## Staged positions

Real play would take many rounds to reach some lessons, so the walkthrough stages them through `guidePort().stage`, which exists only in tutorial mode. Each staging step is said in the coach mark and the game log ("Tutorial supply: …", "Tutorial fast-forward: …"):

- At a lesson's start: a hand of named cards (brought from deck or discard, never invented while a copy exists), resources for that lesson's purchases, a missing Shipyard or unit placed at the Shipyard, the Settler moved to the edge of the nearest neutral world, and a rival Explorer with no Energy placed two hexes from the Fleet.
- During a step, once per turn and only when the step cannot otherwise be completed: one missing card or the resources the step needs.

Staging edits the tutorial's own saved state only. The tutorial saves under `galactic-reach-tutorial-*` keys (the `TUTORIAL` save namespace in `app.js`) and its progress under `galactic-reach-tutorial-progress-v1`, so starting, replaying, skipping or leaving it never reads or writes a guest save. Progress names the current step, so editing the lesson list resumes at the same step. A tutorial save from other rules restarts the lessons.

## Controls

Back reviews earlier steps (with Next to return), Skip lesson stages the next lesson's position, Exit returns to the normal game, and the menu's Restart tutorial deals the practice game again. Inside a battle or a choice window, the note sits at the top of that window. If another window is open, the note says to close it first.

## Keeping it true

When a PR changes a rule a lesson teaches, update that lesson's text, staging and predicate in `tutorial.js`, and the matching guidance note in `guide.js`, in the same PR. Run the walkthrough end to end: `chrome-devtools-axi open 'http://127.0.0.1:PORT/galactic-reach/?tutorial=1'`, then `chrome-devtools-axi run < scripts/tutorial-walkthrough.axi.js`. It completes every step with real pointer input and fails on a step that does not advance.
