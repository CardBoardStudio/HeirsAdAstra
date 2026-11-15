# Strategic rival study

The 37.42 round-19 human report finished 43–19–17–22. Its browser rivals upgraded all starters only to II. The human reached III on all six by round 12 and drew 186 cards, versus 95/123/120 for the rivals, excluding Undo ranges. Only one rival initiated a battle. These observations motivate a policy experiment; they do not establish the balance of human strategies.

The canonical rules are [rival planning](../../prototypes/galactic-reach/rulebook.html#rival-planning), [cards](../../prototypes/galactic-reach/rulebook.html#rival-cards), [Buy](../../prototypes/galactic-reach/rulebook.html#buy), and [combat](../../prototypes/galactic-reach/rulebook.html#combat). Policies use only public board/market data and the acting seat’s own cards and relic knowledge. Human mechanics, setup and RNG must remain unchanged.

## Evaluation protocol

Freeze baseline at `45b3a4057e879c65ec77eed2b5e2ce349445e1cc`. Use the same browser decision functions as solo play, with a headless driver that permits seat zero to be computer controlled. Use 40 Prestige, seeded maps/decks, three strategy profiles, each profile duplicated in turn, and all four seat rotations. Compare paired baseline and updated matches, plus mixed matches to measure strength rather than only self-play balance. Seeds and batch sizes must be chosen before the final evaluation; tuning uses separate pilot seeds. Report incomplete games as incomplete, never invented winners. Track initial map hashes, outcomes, rounds, score sources, upgrades, drawing, purchases, conquests, defenses, resource gains/spending/overflow and banking. Resource throughput is a diagnostic, not proof of equal marginal value. Native-policy checks are reported separately from the browser study.

No result from a small training pilot is the final balance estimate. Preserve old published engines and native policies.
