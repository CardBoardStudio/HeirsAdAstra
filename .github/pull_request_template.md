<!-- Title: "Area: what changes", imperative, ≤ 72 chars (e.g. "Galactic Reach: Harbors refit Fleets").
Commits follow the same shape in miniature: `git config commit.template .gitmessage`. -->

## Change

Describe the player-visible change and why it is useful.

## Rules grounding

<!-- Cite rulebook.html#section links and explain how the change follows or revises those rules.
For work unrelated to Galactic Reach, start with "Not applicable:" and give the reason plus its applicable specification.
Example: [Movement](prototypes/galactic-reach/rulebook.html#movement): preserve the five-unit destination limit. -->

## Gameplay impact

<!-- Start with "None:" or "Changed:" and explain. Changes to any game logic, including fixes, require a meaningful canonical rulebook update in this PR. For a fix, clarify the rule or add an example. -->

## Playtest compatibility

Select exactly one and apply the matching label:

- [ ] `playtest-safe` — ongoing games keep their decisions and saved-state meaning.
- [ ] `playtest-breaking` — experiment branch; start a new game on its own preview.

Target `main` (the dev channel). If players will notice the change, add one `changes/<branch>.md` entry (`compat: breaking` for breaking work). Do not bump versions or edit the "New in this playtest" panel: the release cut does both ([release process](../docs/release.md)). For a breaking experiment, describe one rules hypothesis.

## How to review

<!-- Start at: one file and symbol (e.g. `prototypes/galactic-reach/app.js` `fitMap`).
Risky: the 1-3 places where a bug would hurt players or saved games, and why.
Skim: what is moved, regenerated or screenshots only (and the command that made it).
Commits: "review commit by commit" if the history is curated, else "review the diff". -->

## Decisions for review

<!-- Choices a reviewer could reasonably make differently: the alternative and why you did not take it.
Ask the specific question you want answered. "None." is a valid answer. -->

## Verification

- Player-visible preview change summary (what to try and rule links):
- Checks run and behavior tested:
- Successful Render deployment for this head commit:
- Game URL:
- Rulebook URL on the same preview origin (`/galactic-reach/rulebook.html`):

<!-- Check anonymous access, the game's Rules link, section links, and a narrow viewport. Do not skip a preview for rules-only changes. Report pending or unavailable checks honestly. -->
