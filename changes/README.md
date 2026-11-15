# Pending release entries

Each PR into `main` that players would notice adds one file here, named after its branch (for example `changes/harbor-ships.md`). Distinct names keep parallel PRs from conflicting. Nobody edits or deletes an entry until the release cut does. See [the release process](../docs/release.md).

```markdown
---
compat: breaking
title: Harbors refit Fleets
pr: 57
---
A Fleet that ends its move on your Harbor regains its hull. [Combat](rulebook.html#combat).
```

- `compat`: `breaking` if the change alters setup, legal decisions, costs, card effects, scoring, victory or saved-state meaning (`playtest-breaking`). Otherwise `safe` (`playtest-safe`). Each `breaking` entry starts a new dev revision on the dev site, and the release that includes it bumps the rules version once.
- `title` and body: one or two player-facing sentences for the release notes and the game's "New in this playtest" panel. Link rulebook anchors as `rulebook.html#anchor`. Plain text, `**bold**` and `[links](url)` only.
- `pr`: optional; add it if you know the number.

Internal work that players never see (CI, refactors, docs) needs no entry.
