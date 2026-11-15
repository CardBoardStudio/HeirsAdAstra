# Galactic Reach releases

Newest first. Each section is written by `node scripts/release.cjs cut` from the `changes/` entries merged since the previous release ([release process](release.md)). Releases before this file existed are described in the [rules maintenance guide](rules/README.md).

## 37.42 · Integrated Playtest

<!-- release after 4b7cfc7 -->
Rules-changing release: start a new game. Unfinished 34.39 games and tables keep the archived 34.39 Balance Package playtest engine.
- **Commissioning battles and human Undo** (rules change) (#54): Commissioning onto enemy ships starts combat; a stationary Move can fight again. Rival turns continue after the fight. Build Shipyards on surveyed moons with your ship present. Humans may undo their latest turn and later bot turns until another human acts. [Combat](rulebook.html#combat), [shared tables](rulebook.html#shared-tables).
- **Flexible resources and new relic orders** (rules change) (#54): Convert cards, bank and buy capacity off turn. One Probe / Excavate card locates the closest relic or excavates and is trashed. The center world has a relic; try 23 rewards, three affordable draw-two cards and level III starters. Cargo Expansion raises each limit by 2 once. [Orders](rulebook.html#orders), [resources](rulebook.html#free-economy).
- **Aligned corner portal** (rules change) (#52): Cross between the nine matching lower-left and upper-right entrances for 2 movement. Ordinary steps still cost 1. [Movement](rulebook.html#corner-portals).
- **Developer change queue** (#39): Host administrators can collect requests, link implementation PRs and approve exact-head merges using a temporary GitHub connection. Open Change queue in the developer view.
- **Clearer board and card symbols** (#54): Muted terrain, distinct gray and green, thicker ownership outlines and larger card resource symbols improve desktop play.

## 34.39 · Balance Package playtest

Released before the release process (PR #50). Rules-changing: unfinished 33.38 games and tables keep the archived 33.38 Split Moves engine.

- **Captures need a Fleet** (rules change): to capture an enemy Colony, bring a Settler and one of your Fleets to its center.
- **Decisive wins score 2** (rules change): destroying every opposing unit in a fight gives 2 Prestige instead of 1.
- **Wonders trimmed** (rules change): Dyson Lattice gives 5 Prestige and Galactic Senate Seat 3; prices are unchanged.
- **Better cheap cards** (rules change): several low-cost cards gain an extra build, draw or discount.
- **Seats are dealt** (rules change): your solo neighbor changes each game, and shared-table seats are dealt at random.
