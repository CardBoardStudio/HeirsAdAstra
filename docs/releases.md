# Galactic Reach releases

Newest first. Each section is written by `node scripts/release.cjs cut` from the `changes/` entries merged since the previous release ([release process](release.md)). Releases before this file existed are described in the [rules maintenance guide](rules/README.md).

## 38.43 · Playtest 2026-11-15

<!-- release after 9c969f6 -->
Rules-changing release: start a new game. Unfinished 37.42 games and tables keep the archived 37.42 Integrated Playtest engine.
- **Draw your next hand at cleanup** (rules change): You now draw your opening five cards at setup, and each later hand at the end of the round, after everyone finishes Buy and nobody has won. The round reads Production, Operations, Buy, Cleanup & draw, so you can plan your next hand while the round wraps up. [A round of play](rulebook.html#round).
- **A real table that fits your window** (#53): On a desktop window the game no longer scrolls: the whole window is one table, scaled as a whole to fit. The map fills all the space the other pieces leave, in any window shape. In its top-left corner a small printed track races every faction to the Prestige goal (the acting faction's marker glows; point at a marker for that faction's overview, select it for the breakdown), and in its bottom-left corner a small comms card opens into the whole log. The turn and round and the whole supply at once (an Upgrades tray, the market and the alien relics) lie to the right, and your seat runs along the bottom: Deck and In play, your hand, a player mat of pips (no numbers) for production, stock and a gold capacity fence, and Discard with the turn's buttons. Drag 4 of one resource onto another on your mat to trade with the bank ([Player mat](rulebook.html#player-mat)). Cards look like printed card stock in a slight fan; point at one to read it whole, drag it onto a lit hex to play it or onto your mat to convert it. Market prices sit in each card's corner with a padlock on any resource above your limit, cards you can't buy yet are shaded with the reason ([Buy](rulebook.html#buy)), and held planets are ringed and buildings drawn in their owner's colour ([Reading ownership](rulebook.html#ownership-colours)). iPads get the same table, and phones a full-screen map with the hand, supply, mat, comms and track in drawers.
- **Rivals find another bank exchange before skipping a card**: When a bank exchange would spend the funds a rival keeps for its next unit, the rival now tries exchanging a different resource before it passes on the card. [Rival cards](rulebook.html#rival-cards).

## 37.42 · Integrated Playtest

<!-- release after 4b7cfc7 -->
Rules-changing release: start a new game. Unfinished 34.39 games and tables keep the archived 34.39 Balance Package playtest engine.
- **Commissioning battles and human Undo** (rules change) (#54): Commissioning onto enemy ships starts combat; a stationary Move can fight again. Rival turns continue after the fight. Build Shipyards on surveyed moons with your ship present. Humans may undo their latest turn and later bot turns until another human acts. [Combat](rulebook.html#combat), [shared tables](rulebook.html#shared-tables).
- **Flexible resources and new relic orders** (rules change) (#54): Convert cards, bank and buy capacity off turn. One Probe / Excavate card locates the closest relic or excavates and is trashed. The center world has a relic; try 23 rewards, three affordable draw-two cards and level III starters. Cargo Expansion raises each limit by 2 once. [Orders](rulebook.html#orders), [resources](rulebook.html#free-economy).
- **Aligned corner portal** (rules change) (#52): Cross between the nine matching lower-left and upper-right entrances for 2 movement. Ordinary steps still cost 1. [Movement](rulebook.html#corner-portals).
- **Developer change queue** (#39): Host administrators can collect requests, link implementation PRs and approve exact-head merges using a temporary GitHub connection. Open Change queue in the developer view.
- **Clearer board and card symbols** (#54): Muted terrain, distinct gray and green, thicker ownership outlines and larger card resource symbols improve desktop play.
- **Invite-only dev site** (#57): The dev site now admits only Nido accounts with an invitation. Ask a host for an invitation link, sign in with Nido, and accept it; shared-table links bring you back to your table afterwards.
- **Level I starter conversion and resource-card removals** (rules change) (#68): Only level I Move and Construct starters convert to resources; upgraded starters, unit cards, market cards, and relics cannot. Level III draws only when its order is used. [Resources](rulebook.html#resources), [orders](rulebook.html#orders). Remove cards whose played effects grant resources, plus Galactic Senate Seat. Monument of Accord and Dyson Lattice still award points when bought, then circulate as inert cards until trashed. [Cards](rulebook.html#cards).
- **Rivals build draw engines and defend colonies** (rules change) (#63): Rivals upgrade starters through level III, respond to public threats at Colony centers, and choose market and relic cards for their useful effects. They reconsider cards drawn by orders before passing. Human rules and costs are unchanged. [Rival planning](rulebook.html#rival-planning).
- **New relic signals and unlimited purchases** (rules change) (#62): Probe skips relics you have already discovered and locates your Explorer’s nearest remaining unknown site. If you know every remaining relic, it warns you and keeps your card and action. [Probe](rulebook.html#orders). Buy any number of affordable market cards during your Buy turn, including cards revealed by refills. Procurement Hub keeps its next-purchase discount. [Buying cards](rulebook.html#buy).
- **Order-only level III upgrade hint**: The upgrade button now says the bonus card comes from using the order. Buying the upgrade itself draws nothing. [Upgrading starters](rulebook.html#buy).

## 34.39 · Balance Package playtest

Released before the release process (PR #50). Rules-changing: unfinished 33.38 games and tables keep the archived 33.38 Split Moves engine.

- **Captures need a Fleet** (rules change): to capture an enemy Colony, bring a Settler and one of your Fleets to its center.
- **Decisive wins score 2** (rules change): destroying every opposing unit in a fight gives 2 Prestige instead of 1.
- **Wonders trimmed** (rules change): Dyson Lattice gives 5 Prestige and Galactic Senate Seat 3; prices are unchanged.
- **Better cheap cards** (rules change): several low-cost cards gain an extra build, draw or discount.
- **Seats are dealt** (rules change): your solo neighbor changes each game, and shared-table seats are dealt at random.
