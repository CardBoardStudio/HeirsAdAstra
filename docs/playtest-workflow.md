# Galactic Reach playtest workflow

## Channels

Dev is `main`, deployed on every merge. Stable is the `stable` branch, deployed when the Release PR merges. See [the release process](release.md) for cutting a release and for how dev tables survive merges. The released version and its history are in [releases](releases.md). Shared tables and solo saves keep the revision they were dealt with; old PR preview URLs are not current deployment links.

Create save-compatible work on `codex/<short-name>` from the latest `origin/main` head, open a PR against `main`, apply `playtest-safe`, and add a `compat: safe` entry in `changes/` if players would notice. This includes accessibility, layout, wording, diagnostics, and fixes that preserve available decisions and saved-state meaning. Keep existing guest saves, pinned tables, and replays playable.

## Rules contract for every PR

Read the [canonical rulebook](../prototypes/galactic-reach/rulebook.html) and [maintenance guide](rules/README.md). Cite its section anchors in the PR and explain the gameplay impact. Any game-logic change requires a meaningful rulebook update in that same PR, including a bug fix that restores intended behavior. Clarify the restored rule or give an edge-case example.

The `Rules contract` check requires a grounding declaration and pairs changes in known engine paths with the canonical document. It does not prove semantic agreement: reviewers must compare rules, code, card text, and tests. Work unrelated to Galactic Reach must explain its exclusion and cite its own specification.

The `Review conventions` check is advisory: it reports, without failing, a PR title or commit subject that is not `Area: sentence`, an unanswered template section, template comments left in a ready PR, a commit over 30 changed lines with no body, a compatibility box that is not exactly one, and a missing or mismatched `changes/` entry. It runs the shared [review-conventions](https://github.com/bitswell-hq/review-conventions) workflow with `.github/review-conventions.json`.

## Breaking experiments

A change is breaking if it can invalidate a game or materially change a player's decisions: setup, map generation, turn order, legal actions, card effects/costs, production, combat, scoring, victory, component limits, or saved-state meaning. If uncertain, treat it as breaking until proven compatible.

1. Create `codex/experiment-<short-name>` from the latest `origin/main` head.
2. Describe one rules hypothesis in the rulebook and PR, then implement it with supporting behavior tests.
3. Open a PR against `main`, apply `playtest-breaking`, and add a `compat: breaking` entry in `changes/`.
4. Leave version declarations alone: the release cut changes them once per batch.
5. Wait for checks and try the change locally (`scripts/dev.sh`); Render previews only the Release PR into `stable`.
6. After merge, the change goes live on the dev host as a new `+dev.<n>` revision; dev tables already in progress keep their engine. Never redirect stable saves into an experiment.

## Preview verification

Every rules PR ships the edited source document to `/galactic-reach/rulebook.html` beside that PR's game. Open both without signing in. Check the game's Rules dialog link, rulebook navigation and narrow layout, and any changed mechanic. Include both verified URLs in the PR. The “What’s new in this playtest” panel is written by the release cut from `changes/` entries; a change PR states what to try in its PR description instead. Do not skip Render previews for documentation-only rules changes.

`scripts/build-web.sh` packages the rulebook and its stylesheet; `scripts/check-rulebook.cjs` verifies source and deployed asset contracts. The container smoke requests the rulebook and checks its version marker so a fallback HTML response cannot masquerade as a successful deployment.

## Adopt or reject

Adopting an experiment means merging its PR into `main`; it reaches stable with the next release. Rejected experiments remain separate; close their PRs without changing dev or stable play. Announce a playtest reset before merging a Release PR that changes rules.

The release cut ([release process](release.md#cut-a-release)) increments `SAVE_FORMAT_VERSION` and `RULES_REVISION` once, keeps browser/adapter/Rust/table declarations aligned, and archives the released engine and browser bundle so pinned tables and replays retain their original meaning. Guest save and undo keys derive from the format version. Do not introduce a migration unless the old state means exactly the same thing.

Select exactly one compatibility label: `playtest-safe` or `playtest-breaking`. After a Release PR merges, verify the new successful stable deployment and share its game and rulebook URLs. A PR being ready does not itself authorize a merge.
