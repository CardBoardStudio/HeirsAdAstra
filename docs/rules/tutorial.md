# Tutorial: Learn to play, and on-table guidance

Status: **implemented for 38.43** (`prototypes/galactic-reach/tutorial.js`, `guide.js`, `guide.css`). Players read about both in the rulebook's [Learn to play](../../prototypes/galactic-reach/rulebook.html#learn-to-play) and [Guidance](../../prototypes/galactic-reach/rulebook.html#guidance) sections.

## Two layers

**Guidance** runs in every solo and shared game unless the player switches it off (Guidance in the game menu; stored in `localStorage` `galactic-reach-guide-v1`). On each of your turns it shows one note about one element: the card to use, the lit hex, the affordable supply card, or Pass & buy / Finish Buy. That element gets a cyan ring, a gentle bounce (a still glow for reduced motion) and an arrow; a destination the note names (the Data hex, the nearest free world) gets a dashed ring. Notes call cards cards ("Construct card") and say what to do this turn: cards left in hand are discarded at Cleanup, only resources carry over. The opening it suggests is a Data Harvester, then a Shipyard. The first time a mechanic matters (first Operations turn, Buy turn, Shipyard, Colonize or Probe card, located relic, full resource, Capacity Module, battle, half the Prestige goal), it explains that rule once, with a rulebook link, and remembers that it did. It reads the table through `guidePort()` in `app.js`: the same questions the hand, Sector Scan and market ask (`availableContextOrders`, `canAfford`, `purchaseCost`, …). It never changes the game.

**Learn to play** (`index.html?tutorial=1`) is a seeded game in which the three rivals pass every turn. It drives the same coach mark through fixed lessons. Fresh walkthroughs start with the first Harvester: the player already has its Matter and Data, so the first step lights a Move card to convert for the missing Energy, then the Construct order and Harvester choice follow. Construct conversion is taught after the first build. The score, home-world and mat introductions follow that first build. Existing progress resumes by step id; a save still in the old opening introductions, or at the former separate Move step, starts at the new first card. Each step names its anchor element, its rulebook section and either a predicate on the game state or `info: true`. A step that teaches an action advances only when the player's own action has made its predicate true (alternative solutions count, for example dragging the card instead of pressing its order). Its note has no Next and no button that finds, selects or does the action: the lit card or control on the table is the way on. A reading step (the score track, your home world, the new round, how to win) asks for no click on the table and goes on with **Next**.

**Show, don't tell.** A tutorial hand-card step starts with only that card glowing and gently growing; the other cards do not run the turn glow. The lit card is always the one the player acts on next. As a step starts, the walkthrough brings what it lights into view once (on a narrow screen the scrolling hand moves to the card), so nobody has to hunt for it. Hover, keyboard focus or touch reveals the note and stage, which remain available for that step. Reduced motion keeps a steady cue. Each step's text is one or two short sentences. The rest is shown on the real table by the stage layer in `guide.js`: a spotlight dims everything but the parts the step is about, callout labels name those parts one at a time (the mat's Now row, Rate row and limit pip; the Colony hex that produces), and a ghost card glides along a dashed path from the marked card to where it should be dropped. Hexes are ringed with their own hexagonal ring. With reduced motion the ghost, pulses and bounce stop; the dashed path, rings and labels stay. Own-game guidance uses the same callouts and ghost drag, without the spotlight.

## Lessons

| Lesson | The player does | Rulebook | Advances when |
| --- | --- | --- | --- |
| Resources | Converts the lit Move for the missing Energy of the first Harvester | `#player-mat`, `#resources` | Energy reached the Harvester's price |
| Orders | Uses a Construct card's order on the Data hex next to the Colony and builds a Data Harvester (2 Data a round: Explorers, excavation, upgrades) | `#orders`, `#building` | A Harvester exists |
| Read the table | Reads the score track, home world and mat after building the Harvester, then converts a Construct for Matter | `#shared-board`, `#victory`, `#player-mat` | Next |
| The round | Passes and finishes Buy; then reads the new round (new hand, deck, discard and production labelled): unused cards were discarded, resources carried over | `#round`, `#buy`, `#cleanup-draw`, `#deck-inspection` | Passed; the round advanced; Next |
| Ships | Builds a Shipyard, then commissions a Settler and an Explorer (one Construct card each, one per turn) | `#building` | A Shipyard, then each unit, exists |
| Movement | Splits a move (Fleet without the Settler), then moves the Explorer alone; a Fleet is supplied, with its price | `#split-moves`, `#movement` | The Fleet, then the Explorer, left the Shipyard |
| Relics | Probes, flies to the ◈, excavates and chooses a relic card | `#movement`, `#excavation`, `#alien-relics` | A relic is located, reached, then excavated |
| Colonies | Moves the Settler onto a neutral world's center and founds a Colony | `#orders` | The Settler is on the center; one more Colony |
| The bank | Trades 4 Energy for 1 of another resource on the mat | `#trade` | That resource rose |
| Your Buy turn | Passes; buys a market card; upgrades a starter; buys a Capacity Module; trashes a card; finishes Buy | `#buy`, `#market-tiers`, `#capacity-module` | Each purchase, upgrade or trash is seen; the round advanced |
| Capacity | Plays the Capacity Module and splits its 4 points | `#storage-allocation` | The Storage pile holds a module |
| Combat | Moves the Fleet onto a stray rival Explorer and picks tactics | `#combat`, `#combat-tactics` | A decisive victory is recorded and its report closed |
| Winning | Reads their score and the goal on the score track | `#victory`, `#victory-target` | Next |

## Staged positions

Real play would take many rounds to reach some lessons, so the walkthrough stages them through `guidePort().stage`, which exists only in tutorial mode. Each staging step is said in the coach mark and the game log ("Tutorial supply: …", "Tutorial fast-forward: …"):

- At a lesson's start: a hand of named cards (brought from deck or discard, never invented while a copy exists), resources for that lesson's purchases, a missing Shipyard or unit placed at the Shipyard, the Settler moved to the edge of the nearest neutral world, and a rival Explorer with no Energy placed two hexes from the Fleet.
- As the Explorer's move begins (Movement, second step): any of your units sharing the Explorer's hex step 1 hex aside, to a free hex of the same world nearest the next world to settle, so the Move dropped there flies the Explorer and not the units a Move chooses first.
- During a step, once per turn and only when the step cannot otherwise be completed: one missing card or the resources the step needs.

Staging edits the tutorial's own saved state only. The tutorial saves under `galactic-reach-tutorial-*` keys (the `TUTORIAL` save namespace in `app.js`) and its progress under `galactic-reach-tutorial-progress-v1`, so starting, replaying, skipping or leaving it never reads or writes a guest save. Progress names the current step, so editing the lesson list resumes at the same step. A tutorial save from other rules restarts the lessons. Choosing Learn to play (a link, not a reload or Back/Forward) resumes only a walkthrough left part-way: past its first step and not finished, which is when the welcome note and menu offer Continue Learn to play. Otherwise `tutorial.js` clears the `galactic-reach-tutorial-*` keys before `app.js` loads, so a fresh Lesson 1 is dealt a fresh practice game; unreadable progress counts as not part-way. When another tab removes the progress (Restart tutorial, or a new walkthrough), an open walkthrough reloads onto it rather than saving the earlier one back.

## Controls

Every note has Back and a quieter Exit tutorial, with Skip lesson as a small link. A reading step, or a step being reviewed, also has Next (primary); a step that waits for an action has no primary button. Back reviews earlier steps (Next returns), Skip lesson stages the next lesson's position, Exit returns to the normal game, and the menu's Restart tutorial deals the practice game again. Inside a battle or a choice window, the note sits at the top of that window. If another window is open, the note says to close it first.

## Keeping it true

When a PR changes a rule a lesson teaches, update that lesson's text, staging and predicate in `tutorial.js`, and the matching guidance note in `guide.js`, in the same PR. Run the walkthrough end to end: `chrome-devtools-axi open 'http://127.0.0.1:PORT/galactic-reach/?tutorial=1'`, then `chrome-devtools-axi run < scripts/tutorial-walkthrough.axi.js`. It completes every step with real pointer input and fails on a step that does not advance.
