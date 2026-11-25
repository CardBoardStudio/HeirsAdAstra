# Open playtest work integration

This integration carries forward PRs #90, #133, #188, #190 and #191 onto the current main branch. The release cut runs after the combined changes pass verification.

## Card rebalance on the current catalog

PR #90 predates the later market retirements and cheaper prices. Preserve those later decisions: retired cards stay outside new supply, Fold-Space Gate keeps its newer 6 Energy + 1 Data price, and World Engine keeps its newer 6 Matter + 1 Energy + 1 Life price and draw. Retired card definitions keep their current values. This does not reintroduce Procurement Hub, Trade Syndicate or Colony Pods.

Carry forward the applicable rebalance: Dyson Lattice grants 4 Prestige; Ascendancy Codex grants 1 per use without a draw; Hyperspace Vaults raises each limit by 1 per use; Folded Warehouse raises each limit by 2, draws two cards, then trashes, respecting the current limit of 15. Genesis Charter costs 2 Matter, 7 Life and 1 Data. Add M11 Torpedo Barrage at 6 Energy, 2 Life and 2 Data, for 3 hits and 3 shields. The market now has 6 Cheap, 10 Medium and 12 Expensive designs, with two copies each. Capacity Module prices and the sixteen-relic catalog are unchanged.

The canonical [card reference](../../prototypes/galactic-reach/rulebook.html#cards), [market rows](../../prototypes/galactic-reach/rulebook.html#market-tiers), [victory examples](../../prototypes/galactic-reach/rulebook.html#victory) and [alien relics](../../prototypes/galactic-reach/rulebook.html#alien-relics) state the resulting rules. Earlier simulation percentages remain evidence for their frozen sources and card catalogs, not a new balance claim for this combined catalog.

The old card-evolution generator recalibration is not applied: it was fitted to the earlier prices and its archived runner seam no longer matches the current engine. Keep that historical tooling unchanged. New studies use the canonical browser-policy runner under AGENTS.md; this integration starts no new balance study and does not treat older card-evolution results as validation of the combined catalog.

## Other integrated work

- PR #133 makes accepted choices final only in fresh phone-paired games, with explicit Pass and Finish Buy. Earlier tables retain Undo and automatic turns.
- PR #188 aligns current branding and the CI check name used by the administrator queue; compatibility identifiers and frozen sources stay unchanged.
- PR #190 adds the confirmed Military Focused plan, makes it the default military rival and lets solo players choose all three rival profiles independently, including repeats. Existing games keep their assigned profiles.
- PR #191 presents Willem’s battles on physical combat mats while keeping Max’s separate renderer and the authoritative combat rules.

The release cut remains workflow-owned. Merge the combined changes first, then refresh and verify the cut. Publishing stable is a separate step.
