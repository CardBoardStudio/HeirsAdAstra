# Split Moves (33.38 playtest)

**Request.** On 2026-11-14 the captain asked: when two units share a hex, can you separate them and move just one? This would land as a new PR after the 31.36 merges (#42, #45, #46). Under the 31.36 rules a Move order selected a whole group: every combat ship on the hex, or its Explorer team. "You cannot split individual ships from the selected group." The captain wanted everything to move together by default, with the option to deselect ships.

**Rule** ([#movement](../../prototypes/galactic-reach/rulebook.html#movement), [#split-moves](../../prototypes/galactic-reach/rulebook.html#split-moves), [#orders](../../prototypes/galactic-reach/rulebook.html#orders), [#computer-rivals](../../prototypes/galactic-reach/rulebook.html#computer-rivals)):

- A Move order chooses one hex and some of your units on it: any number of Settlers and Fleets, or any number of Explorers. The chosen units move together at the slowest chosen unit's speed. Units left behind stay on the hex.
- By default every combat ship is chosen, or every Explorer when no combat ship is there. The old one-click flow still works.
- Move II, movement cards (Ion Thrusters, Strike Vector, Fold-Space Gate, Phase-Shear Drive, Obelisk) and Slipstream Charts' hostile-hex restriction apply to the chosen units.
- Each Move order moves one chosen group from one hex and uses one Move card. Moving the units left behind takes another Move order on a later turn.
- Hostile hexes, combat, retreat and Explorer escape are unchanged. Only the chosen units attack. A forced retreat takes every surviving attacker, and a paid escape follows #combat. Neither is a Move order.

**Why Explorers stay a separate team.** Explorers can split from each other, so two Explorers can head for two relics. They never join combat ships in one order. Mixing them would let an Explorer join an attack from the start. That changes combat and escape (attacking Explorers, paid escape from your own attack, damage order), and that is out of scope. It also adds nothing a player cannot already do with two orders. Keeping two kinds of group, combat ships or Explorers, keeps the rule to one sentence. It also matches the old "Explorer team" wording players know.

**Command shape.** Legal Move actions carry `units: {settler, explorer, fleet}` counts beside the old `moveGroup` (`'ships'` or `'explorer'`, now derived from `units`). `legalActions` lists every count combination at each source, largest group first, so a policy that ties picks the whole group. `applyAction` fills a partial `units` object with zeros. A command naming only `moveGroup` means the whole group, as before 33.38. The browser always sends the full `units` object, which the shared-table server matches field by field against the legal list (`resolve` in `crates/server/src/shared/mod.rs`).

**Interface.** With a Move order active, selecting one of your hexes ticks its default group, highlights reachable hexes and opens Sector Scan. The **Units moving · speed N** box there has one checkbox per unit type and, when there are several of a type, a count. Changing either recomputes speed and destinations at once. Ticking an Explorer switches to the Explorer team, and ticking a combat ship switches back. At least one unit stays ticked. The Orders-from-your-hand shortcuts ("Move ships", "Move Explorers") start from the same picker. While a Move's units are being chosen, Sector Scan anchors beside the source and all its highlighted destinations, so it does not cover the hexes you need to click. The printed Move card now reads "Move the units you choose from one hex (combat ships or Explorers) at the slowest one's speed."

**Rivals.** Browser rivals (`chooseAiMove`) consider a Fleets-only group when Fleets share a hex with Settlers. That happens when the Settler is parked on its Colony site, and when gathering with or escorting other groups. They only do it if the Settlers left behind are safe alone (`aiThreat` ≤ 0.3, the same estimate used before moving Settlers). Native policy 26 (arena and shared-table rivals) scores only the action's `units` and subtracts the threat to Settlers left behind (×130, like moving Settlers into danger). Earlier rules list no `units`, so policy 26 scores the whole group there exactly as before and stays version 26.

**Versioning.** This is `playtest-breaking`: legal decisions and the meaning of a Move change.

- New games use **save format 33, rules 38** (`galactic-reach/33.38`, "Split Moves playtest") and `-v33` browser keys.
- The exact 32.37 browser, manual, engine, card gallery and shared-table client (main at `0659abf`) are archived as `crates/galactic-reach/rules/v32-*`, served at `/galactic-reach/rules/32.37/` and pinned in `scripts/split-moves-archive-hashes.json`.
- 32.37 tables, replays and `with_rules` use that archive. Shared tables keep their dealt rules: the existing 30.35, 31.36 and 32.37 engines retain snapshot and Undo support after this cutover.

**Checks.**

- `scripts/test-split-moves.cjs`: subset move and leftovers; speed of the chosen units with Move II and a movement card; one Move card per order; the Explorer team; command normalization and refusals; unchanged combat; browser rivals splitting only when safe; the human picker flow; and the 32.37 archive.
- `split_moves_leave_safe_settlers_and_keep_exposed_ones_escorted` (native policy) and `a_shared_move_can_leave_units_behind` (a shared table accepts the browser's command and leaves the rest behind).
