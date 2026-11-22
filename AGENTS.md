# Project instructions

## Interface scope

- Design, adjust, and verify the UI for desktop, iPad (landscape and portrait) and phones, with touch working for everything. Phones may scroll inside drawers; desktop and iPad game screens may not scroll.
- Game screens must fit the viewport at 1280x720 and larger: no scrolling may be required to view or play. Long reference content (rulebook, card gallery, game report) may scroll. `node scripts/check-viewport-fit.cjs` checks key play states.
- Accessibility work still covers desktop keyboard operation, screen-reader labels, focus visibility, contrast, and desktop window sizes. State the coverage actually tested.

## Max’s UI is a separately owned interface

- Max’s UI (`body.background-stars`, `max-ui.css` and the Max-specific card-bank/render paths) is controlled by Max. Do not change its colors, cards, cost boxes, controls or layout as part of work on Willem’s UI or the main interface. Max will explicitly request which changes to adopt.
- Scope Willem’s UI presentation changes to `body:not(.background-stars)` or its own stylesheet. Shared styles, palettes and card renderers must preserve Max’s UI; an apparently global improvement is not authorization to apply it there.
- Keep Max’s presentation in `max-ui.css` and explicit Max rendering branches. Share game rules and authoritative actions. When Max requests a change here, verify both themes and confirm Willem’s UI is unchanged.

## Combat scope

The discussed battle redesign is not approved by this refinement work. Do not change attack/hull values, the per-battle tactic allowance, or when base attack applies without a separate explicit request. Keep the existing combat resolution; the requested Gravity Scepter target change and combat presentation improvements are separate, explicit requests.

## GitHub workflow

- Use HTTPS remotes, never SSH.
- Do not add co-author trailers for an AI agent.
- Do not merge without explicit user authorization. Do not write to upstream or third-party repositories unless the user names them.

## Ground every PR in the rules

- Read the [canonical Heirs Ad Astra rulebook](prototypes/galactic-reach/rulebook.html) and [rules maintenance guide](docs/rules/README.md) before planning changes. The HTML is the editable source document, served unchanged at `/galactic-reach/rulebook.html`; do not create a second copy of its rules in Markdown, a tutorial, or a generated site.
- Every PR must cite the relevant rulebook section anchors in **Rules grounding** and explain how the change follows them. If the work is unrelated to Heirs Ad Astra (for example, Voidwright or account infrastructure), explicitly explain why the rulebook does not apply and cite the applicable existing specification instead.
- Any change to Heirs Ad Astra game logic MUST include a meaningful update to the canonical rulebook in the same PR. This includes fixes, setup, legal actions, automatic resolution, costs, card effects, production, AI-specific rule behavior, scoring, victory, and saved-state meaning. For a fix restoring a rule, clarify that rule or add the edge-case example. Tests and changelogs alone do not satisfy this requirement.
- Establish the intended rule in prose before implementing it. Keep rules, implementation, printed card/help text, and behavior tests consistent. If they disagree, record the discrepancy and resolve the intended behavior explicitly; do not silently turn an implementation accident or proposed idea into a new rule. The initial 6.11 baseline records existing exceptions in [implementation notes](docs/rules/implementation-notes.md).
- Keep the rulebook approachable: lead with what a player does, use short sentences and concrete examples, put costs in tables and exceptions in the reference, and preserve section anchors. Keep developer details in `docs/rules/`, not the player's learning flow.
- The PR template and `Rules contract` CI check enforce grounding and paired rulebook edits for known rule-bearing paths. The path check is conservative and cannot infer semantics; shared engine files require a useful rulebook clarification even for presentation-only edits. Reviewers must also inspect logic changes outside those paths. Do not bypass the gate or make cosmetic rules edits to satisfy it.
- The tutorial is future work. Follow the [tutorial brief](docs/rules/tutorial.md) after the rules and known discrepancies are reviewed; teach the canonical sections through the real engine, and update tutorial steps in the same PR whenever their rules change.

## Canonical live site and rulebook

- Drawing Board deployments on Render are the canonical live playtest sites. Never present a `chatgpt.site` deployment as the live game or rulebook unless the user explicitly requests that separate host.
- The stable deployment is <https://heirsadastra.app/> (Render origin <https://drawing-board-p0g3.onrender.com/>); the dev site is <https://dev.heirsadastra.app/>. Before sharing any live link, verify the latest successful GitHub deployment status for the intended commit and use its `environment_url`; preview URLs can change.
- An unmerged PR into `stable` (the Release PR) must link to its own successful Render deployment, including `/galactic-reach/rulebook.html` on that same origin. Do not link a preview game to `main`'s rules or a hard-coded old PR preview.
- The build must package the canonical rulebook and stylesheet with the game. Verify anonymous access, game-to-rules navigation, section links, and a narrow desktop window. Rules changes need a preview just like code changes; never add `render-preview-skip` to a rules PR.
- Publishing means pushing to GitHub and confirming the corresponding Render deployment. Opening a PR does not authorize merging it. Report missing or failed deployments honestly.

## Playtest change lanes

- Two channels ([release process](docs/release.md)). **Dev** is `main`: every merge deploys automatically to the self-hosted dev host ([dev host](docs/release.md#dev-host)); change PRs into `main` have no Render preview. **Stable** is the `stable` branch, deployed to the stable site; merging the standing Release PR (`main` → `stable`, merge commit) is the release. Never commit to `stable` directly. [docs/releases.md](docs/releases.md) names the released version; shared tables and solo saves keep the revision they were dealt with, on archived engines.
- Branch every change from `origin/main` (`codex/<short-name>`, or `codex/experiment-<short-name>` for rules experiments) and open the PR into `main`. Apply exactly one of `playtest-safe` or `playtest-breaking`. A change is breaking if it can invalidate an ongoing game or materially change player decisions, including setup, topology, phases, economy, combat, card contents, scoring, victory, limits, or persisted state meaning.
- A change PR adds one `changes/<branch>.md` entry for anything players notice (`compat: breaking` for breaking work) and keeps its rulebook update in the same PR. It never edits version numbers, `RULES`/`EXPERIMENT`, the "New in this playtest" panel, archived engines (`crates/galactic-reach/rules/`), archive hashes, or existing entries. The `Rules contract` CI job enforces this (`scripts/release.cjs check`).
- Test a change locally (`scripts/dev.sh`), then on the dev host after merge. Dev tables survive merges: a rules-changing merge starts a new `+dev.<n>` revision while tables in progress keep their engine. Never redirect an existing game to an incompatible ruleset.
- Release by running `node scripts/release.cjs cut` on a `release/*` branch into `main`. It bumps `SAVE_FORMAT_VERSION`/`RULES_REVISION` once per batch, archives the released engine from `stable`, and writes the notes. Then merge the Release PR, announce any reset, and verify the stable deployment. Close rejected experiment PRs unmerged.

## Verification

- Run `node scripts/test-rules-contract.cjs` and `node scripts/check-rulebook.cjs` for rules/tooling edits. Run the check against `dist/galactic-reach` after `./scripts/build-web.sh` to verify packaged assets too.
- Run the relevant Heirs Ad Astra mechanic, dialog, and replay suites for changes affecting their behavior. Rust changes require workspace tests, formatting, and Clippy; build/package changes require the Wasm build and container smoke. See `.github/workflows/ci.yml` for exact commands.
- In the PR, state the rule sections, gameplay impact, compatibility label, verification performed, and verified preview game/rulebook URLs. Distinguish tests run from checks still pending.

## Bot simulation retention

- Every bot study must retain complete per-game archives, including failures and interrupted games. Never keep only aggregate summaries or seeds.
- Use the archival `factory` in `scripts/strategic-bot-study.cjs` or the `SimulationArchive` recorder in `scripts/lib/simulation-archive.cjs`. Include exact rules/policy/harness sources, task configuration, full private state and engine counters, action/event history and the random stream. Do not copy an old summary-only harness.
- Put study archives in a persistent output directory (`GR_SIMULATION_ARCHIVE_DIR` when using a temporary checkout), and link it with the results. Do not prune or overwrite previous runs without explicit instruction. Keep new study output in persistent storage until an external archive destination is approved and verified. Historical doc links stay pinned to retained commits; CI refuses study output, screenshots and large binaries in this repository ([history slim](docs/history-slim.md)).
- Use saved checkpoints and round/resource events for reanalysis. See [simulation archives](docs/simulation-archives.md) for the schema, reader, crash recovery and CI retention limits.

## Canonical bot policy

- Use the browser rival policy for every new Heirs Ad Astra game, bot study, and ORCD tournament. Run `scripts/browser-bot-study.cjs`; do not create or tune a separate Rust decision policy.
- Rust policies are archived in `crates/galactic-reach/src/archived_rust.rs` and the older `legacy_v*` modules. Keep them immutable for previously dealt tables and historical replay/result reproduction only. Never use them for new balance claims or default opponents.
- `archived-rust-bots` and `GR_ALLOW_ARCHIVED_RUST_BOTS=1` are historical reproduction opt-ins, not ways to start a new study. Keep all prior sources, binaries and full game archives.
