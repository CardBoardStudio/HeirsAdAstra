# Trash from hand during Buy

**Decision.** The captain decided on 2026-11-15 that you may trash cards in your hand, not only cards you played. Before this change, Decommission covered only cards in your discard or in play when your Buy turn began ([in-play Buy](in-play-buy.md)).

**Rule** ([#buy](../../prototypes/galactic-reach/rulebook.html#buy)):

- **Decommission:** trash any card that was in your hand, discard or in play when your Buy turn began and is still there, for three of one resource type each.
- **Still ineligible:** newly bought cards, cards drawn or explicitly discarded during this Buy, and cards put in play during this Buy (a hand card used for its Buy effect moves to play and loses eligibility).
- Nothing else changes: the price, upgrades, and the cleanup of hand and in-play cards are as before.

**Implementation.**

- `startBuyPhase` in `prototypes/galactic-reach/app.js` records `buyStartHandIds` beside `buyStartDiscardIds` and `buyStartInPlayIds`. `trashEligible(player, card, pile)` checks the pile's snapshot, and `trashEligibleCards(player)` lists eligible cards from discard, play and hand, in that order. Saves without `buyStartHandIds` treat the hand as ineligible.
- `adapter.js` offers `decommission` for every eligible card, so shared tables need no new command: the existing `decommission` command already names a card id.
- UI: the Trash dialog lists hand cards ("in hand"), and each eligible hand card shows **Trash…**, which opens that dialog to choose the payment.
- **Rivals.** Browser rivals (`runAiBuy`) choose a surplus basic card from `trashEligibleCards`, so hand cards share the discard and in-play priorities. The native policy (`gr-*/29`) finds the trashed card in discard, play or hand and scores it the same way. Archived engines never offer a hand card, so their games and replays play exactly as before; the policy version is unchanged, as in [cheaper cards](cheaper-cards.md).

**Versioning.** This changes legal Buy decisions, so it is `playtest-breaking` with a `compat: breaking` entry in `changes/`. Tables in progress keep the engine they were dealt with.

**Checks.** `scripts/test-trash-hand.cjs` (run in CI from `test-in-play.cjs`) covers hand eligibility and price, the ineligibility of cards used, drawn or bought during Buy, old saves, browser rivals, and rival-only games finishing. The native policy test `decommission_scores_hand_cards` covers a hand card.
