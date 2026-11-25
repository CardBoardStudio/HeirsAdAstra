// Heirs Ad Astra: a fair, private draw from a committed deck.
//
// Statement (everything `pub` is a public input the table contract supplies
// from its own storage, except the two outputs it records):
//
//   The seat knows `seed` with H(DOM_SEED, table_seat, seed) == seed_commit,
//   and deck counts D with H(DOM_DECK, D, salt) == deck_commit_old and
//   sum(D) == deck_size_old. Drawing `n` cards, each the
//   (H(DOM_PICK, seed, beacon, nonce, j) mod remaining)-th card of the deck in
//   type order, folding the public discard in once if the deck runs out,
//   leaves D' with H(DOM_DECK, D', salt') == deck_commit_new, and card j sits
//   behind slot_commits[j] == H(DOM_SLOT, type_j, H(DOM_SLOTSALT, seed, beacon, nonce, j)).
//
// The seat cannot pick its cards: the beacon is fixed by the contract after
// the seed was committed. Nobody else learns them: the seed, the deck split
// and the slot salts stay private. Slots past the cards actually drawn are 0.
use poseidon::poseidon2::Poseidon2;

global T: u32 = 40;      // card types (27.32 has 39 incl. starter/upgrade variants)
global MAX_DRAW: u32 = 5;

global DOM_SEED: Field = 0x4752534545440001;     // "GRSEED"
global DOM_DECK: Field = 0x475244454b0002;       // "GRDEK"
global DOM_DECKSALT: Field = 0x47524453540003;   // "GRDST"
global DOM_PICK: Field = 0x475250494b0004;       // "GRPIK"
global DOM_SLOT: Field = 0x4752534c540005;       // "GRSLT"
global DOM_SLOTSALT: Field = 0x47525353540006;   // "GRSST"

fn deck_hash(counts: [u32; T], salt: Field) -> Field {
    let mut input: [Field; T + 2] = [0; T + 2];
    input[0] = DOM_DECK;
    for t in 0..T {
        input[t + 1] = counts[t] as Field;
    }
    input[T + 1] = salt;
    Poseidon2::hash(input, T + 2)
}

fn main(
    seed: Field,
    deck: [u32; T],
    deck_salt: Field,
    table_seat: pub Field,
    seed_commit: pub Field,
    beacon: pub Field,
    nonce: pub Field,
    n: pub u32,
    deck_size_old: pub u32,
    deck_commit_old: pub Field,
    discard: pub [u32; T],
    fold: pub bool,
    deck_commit_new: pub Field,
    slot_commits: pub [Field; MAX_DRAW],
) {
    assert(Poseidon2::hash([DOM_SEED, table_seat, seed], 3) == seed_commit);
    assert(deck_hash(deck, deck_salt) == deck_commit_old);
    assert(n <= MAX_DRAW);

    let mut counts = deck;
    let mut size: u32 = 0;
    for t in 0..T {
        assert(counts[t] < 256);
        size += counts[t];
    }
    assert(size == deck_size_old);
    let mut discard_size: u32 = 0;
    for t in 0..T {
        assert(discard[t] < 256);
        discard_size += discard[t];
    }
    // The contract computes `fold` from public sizes; the circuit agrees.
    assert(fold == ((deck_size_old < n) & (discard_size > 0)));

    let mut folded = false;
    for j in 0..MAX_DRAW {
        let mut slot: Field = 0;
        if j < n {
            if (size == 0) & fold & !folded {
                for t in 0..T {
                    counts[t] += discard[t];
                }
                size = discard_size;
                folded = true;
            }
            if size > 0 {
                let r = Poseidon2::hash([DOM_PICK, seed, beacon, nonce, j as Field], 5);
                let idx = (r as u64 % size as u64) as u32;
                let mut acc: u32 = 0;
                let mut chosen: u32 = 0;
                let mut found = false;
                for t in 0..T {
                    let c = counts[t];
                    if (!found) & (idx < acc + c) {
                        chosen = t;
                        found = true;
                    }
                    acc += c;
                }
                assert(found);
                counts[chosen] -= 1;
                size -= 1;
                let salt = Poseidon2::hash([DOM_SLOTSALT, seed, beacon, nonce, j as Field], 5);
                slot = Poseidon2::hash([DOM_SLOT, chosen as Field, salt], 3);
            }
        }
        assert(slot_commits[j] == slot);
    }
    assert(folded == fold);
    let new_salt = Poseidon2::hash([DOM_DECKSALT, seed, beacon, nonce], 4);
    assert(deck_hash(counts, new_salt) == deck_commit_new);
}
