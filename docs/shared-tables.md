# Shared Galactic Reach tables

Two to four people play one Galactic Reach game in separate browsers; AI rivals fill the empty seats. Player rules: [rulebook #shared-tables](../prototypes/galactic-reach/rulebook.html#shared-tables).

## How a move travels

1. A browser opens `/galactic-reach/?shared=<id>` (`prototypes/galactic-reach/shared.js`). It loads its seat's private view from `GET /api/shared/<id>` and follows `GET /api/shared/<id>/stream` (server-sent events). A reload or reconnect receives the current view again. A quiet stream sends `ping {seq}` every 10 seconds. A proxy such as tailscale serve can keep a stream open, but silent, after the server behind it restarts, so the page reconnects when it hears nothing for 25 seconds and resyncs whenever a ping shows a newer sequence, the tab becomes visible, or the network returns.
2. The normal game interface runs in networked mode (`options.network` in `app.js`). It renders that view, uses the usual dry-run checks for its controls, and turns each choice into a seat command such as `{type:'build', card, coord, kind, discountResource}`. No rule runs in the browser.
3. `POST /api/shared/<id>/act {seq, actions}` goes to the table service (`crates/server/src/shared/`). The service checks that the account owns the active seat and that `seq` is the table's head, then matches each command to exactly one legal action of the rules engine (the QuickJS adapter in `crates/galactic-reach`) and applies it.
4. The service appends the action, plus any shuffles it caused, to the table log in one transaction and notifies every connected seat. AI seats then move one decision at a time through the same path.

A table is an append-only log, and the live position is `fold(log)`.

## Snapshots

Replaying a log needs the exact engine that wrote it. A save-compatible edit to the current rules (for example 30.35's change to Probe, with no new version) can change how older events replay, while a solo save simply loads its stored state. Shared tables work the same way: after every change the service stores a snapshot after that event (`TableLog::save_snapshot`, the newest 64 kept). A snapshot holds the full state, secrets included, plus the engine's card and turn counters, and it never leaves the server. To rebuild a table, the service resumes from the newest snapshot that no later `undo` reaches behind, then replays only the events after it; without a usable snapshot it replays the whole log. If neither works, players see "This shared table was dealt with an earlier build of these rules…" instead of a server error. A snapshot is a server convenience, not part of the ZK seam: the log still defines the game, and in a ZK table each seat would keep its own private state.

Before moving unfinished tables to a newer, save-compatible build, run `server snapshot-shared` with the build they were dealt on. It snapshots every unfinished table at its head and reports any it cannot load.

## Undo

The seat to move may undo its own actions from the current turn (`POST /api/shared/<id>/undo {seq}`). Each action event records the turn it was taken in (the engine's runtime turn counter) and whether it revealed hidden information. The server compares `undoMark()` before and after the action: deck sizes, the market and relic piles, surveys, located relics and combat, plus any fresh shuffle. A revealing action is a checkpoint, and Undo stops just after the latest one. Undo appends an `undo` event `{to}`, and the fold skips that seat's later actions. Rows are never deleted, so the hash chain stays valid. No undone action ever caused a shuffle, so every logged permutation is replayed in order and the authority never deals again. After an undo the service folds the table again, and every connected seat receives the rolled-back view. If the server restarts, or an apply fails, the service forgets its in-memory engine and folds the log again. Once the game ends, the authority appends a `reveal` event and every seat may download the full record.

## The two seams

| Interface | Methods | Today |
| --- | --- | --- |
| `log::TableLog`: table storage | `create`, `table`, `tables_for`, `append(id, head, events)`, `read`, `finish` | `SqliteTableLog`: three tables in the server's existing SQLite database, with a domain-separated hash chain per event |
| `authority::HiddenInfoAuthority`: hidden information | `shuffle(table, index, n, purpose)`, `replay_shuffle(event, n, purpose)`, `private_view(engine, seat)`, `reveal(table, events)` | `TrustedAuthority`: the server picks each permutation with OS randomness and logs the order privately, with only a salted SHA-256 commitment public. It projects views with `privateState(seat)` in `adapter.js` and opens every commitment at the end. |

The engine draws no randomness of its own at a shared table: every `shuffled()` call (map, starting decks, market and relic piles, reshuffles) asks the authority for a permutation, labelled with its purpose, for example `deck:2` or `market-deck`. Draws, market reveals and relic-row refills then follow from those orders. Seats learn their own draws only through `private_view`.

## What a zero-knowledge table replaces

The `zk/` prototype already proves one seat's fair private draw (`zk/circuits/gr_draw`, Noir/UltraHonk, about 0.6 s in the browser) and keeps per-seat commitments in the `gr-table` Soroban contract (`new_table`, `sit`, `draw`, `play`, `cleanup`). Implementing the same two interfaces with them would work like this:

| Seam method | Trusted server today | ZK implementation |
| --- | --- | --- |
| `shuffle` | Server permutation; private order, public commitment | No global order. Each seat commits a secret seed when it sits (`sit`); the contract fixes a beacon afterwards, so nobody can steer the result. Public piles (map, market, relics) use a commit-reveal beacon. |
| Drawing private cards | Engine pops the deck the server shuffled | The seat proves `gr_draw`: `n` cards were picked fairly from its committed deck counts, producing new deck and slot commitments. The contract verifies the proof in `draw`. |
| Revealing a card publicly | Engine state that every view includes | `play` opens a slot commitment (card and salt); `cleanup` returns cards to the committed discard. |
| `private_view` | Server projects each seat's view | Each browser assembles its own view from the public log plus its private seed and salts. The server, now a relay and indexer, never holds hands. |
| `TableLog::append` | SQLite transaction with a `head` check | Contract calls: ledger order replaces `head`, and the contract stores the commitments. |
| `reveal` | Server opens every commitment at the end | Not needed: every draw was proven when it happened. |
| Undo | `undo` event; checkpoints at every reveal | Unchanged: an undo is a log entry, and checkpoints already stop it before any proven draw or opened commitment. |

What still blocks that swap: the circuit covers draws from one seat's deck, while the engine also shuffles shared piles and the map; every other rule (costs, combat, scoring) would need proofs or a trusted referee; and timeouts and abandoned seats need rules (see [architecture](architecture.md#soroban-and-zkp-path)). The interfaces are small on purpose: a ZK implementation changes `authority.rs`, `log.rs` and the browser's view assembly, not the table service or the game interface.

## Limits of this version

- No seat timeouts: a table waits for an absent person.
- The game report opens only after the game ends.
- Seats are fixed at Start; nobody can join or leave a started table.
- Shared play runs only the current rules. A rules cutover strands unfinished shared tables: the server reports their pinned version instead of folding them with a newer engine. Archived engines would need the shared-table constructor to resume them.
- On shutdown the server ends every live stream and exits within 5 seconds. Graceful shutdown would otherwise wait forever on open streams, and the old process would keep serving a frozen copy of each table to its browsers.
- One server process per database: the table service keeps live engines in memory and serializes each table's writes.
