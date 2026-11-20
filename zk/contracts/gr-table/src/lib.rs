//! Heirs Ad Astra table (scout prototype): private hands from committed decks.
//!
//! One hidden-information mechanic end to end. Each seat commits a secret seed
//! when it sits. Every draw is two steps so nobody can preview it: an action
//! the seat cannot take back (sitting, a round's cleanup, or playing a draw
//! card) fixes a fresh beacon from the ledger PRNG, then the seat proves the
//! draw with `circuits/gr_draw` (UltraHonk ZK, keccak transcript). The proof
//! shows the cards were chosen by H(seed, beacon, …) from the committed deck
//! and puts each card behind a salted slot commitment. Playing a card opens
//! its slot. The deck split, the hand and the seed never appear on chain.
//!
//! Not the whole game: resources, map, combat and turn order stay in the
//! existing rules engine for this slice.
#![no_std]
extern crate alloc;

use soroban_poseidon::poseidon2_hash;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, crypto::bn254::Bn254Fr, panic_with_error,
    vec, Address, Bytes, BytesN, Env, Vec, U256,
};
use ultrahonk_soroban_verifier::UltraHonkZkVerifier;

const VK: &[u8] = include_bytes!("gr_draw.vk");
pub const T: u32 = 40;
pub const MAX_DRAW: u32 = 5;
const HAND_START: u32 = 5;
const DOM_SEED: u64 = 0x4752534545440001;
const DOM_DECK: u64 = 0x475244454b0002;
const DOM_SLOT: u64 = 0x4752534c540005;
// Card codes (lib/grzk.mjs CARD_TYPES) whose play draws more cards.
const ECHOES: u32 = 29; // Echoes of the First Dawn: draw three
const FORESIGHT: u32 = 22; // Tactical Foresight: draw three
const BROKERAGE: u32 = 23; // Data Brokerage: draw two
const TTL_BUMP: u32 = 17_280 * 7;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NoTable = 1,
    SeatTaken = 2,
    NoSeat = 3,
    NoPendingDraw = 4,
    DrawPending = 5,
    BadProof = 6,
    BadSlot = 7,
    BadOpening = 8,
    BadCard = 9,
    NotCanonical = 10,
    HandNotEmpty = 11,
}

#[contracttype]
#[derive(Clone)]
pub struct Pending {
    pub n: u32,
    pub nonce: u32,
    pub beacon: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct Seat {
    pub player: Address,
    pub seed_commit: BytesN<32>,
    pub deck_commit: BytesN<32>,
    pub deck_size: u32,
    /// Public discard pile, as counts per card code.
    pub discard: Vec<u32>,
    /// Cards used this round, as codes, until cleanup.
    pub in_play: Vec<u32>,
    /// Slot commitments of the cards in hand, in draw order.
    pub hand: Vec<BytesN<32>>,
    pub nonce: u32,
    pub pending: Option<Pending>,
    pub round: u32,
}

#[contracttype]
pub enum Key {
    Tables,
    Table(u32),
    Seat(u32, u32),
}

#[contracttype]
#[derive(Clone)]
pub struct Table {
    pub host: Address,
    pub seats: u32,
}

fn field(e: &Env, x: u64) -> U256 {
    U256::from_u32(e, 0).add(&U256::from_u128(e, x as u128))
}
fn u256(e: &Env, b: &BytesN<32>) -> U256 {
    U256::from_be_bytes(e, &Bytes::from_array(e, &b.to_array()))
}
fn bytes32(e: &Env, v: &U256) -> BytesN<32> {
    let mut out = [0u8; 32];
    v.to_be_bytes().copy_into_slice(&mut out);
    BytesN::from_array(e, &out)
}
fn h(e: &Env, inputs: Vec<U256>) -> BytesN<32> {
    bytes32(e, &poseidon2_hash::<4, Bn254Fr>(e, &inputs))
}
fn canonical(e: &Env, b: &BytesN<32>) {
    // BN254 scalar field: reject anything at or above 0x30644e72…
    let a = b.to_array();
    if a[0] >= 0x30 {
        panic_with_error!(e, Error::NotCanonical);
    }
}
fn table_seat(table: u32, seat: u32) -> u64 {
    (table as u64) * 16 + seat as u64
}
fn starter_deck_commit(e: &Env) -> BytesN<32> {
    let mut v = vec![e, field(e, DOM_DECK)];
    for t in 0..T {
        v.push_back(field(e, if t == 0 || t == 3 { 3 } else { 0 }));
    }
    v.push_back(field(e, 0));
    h(e, v)
}
fn beacon(e: &Env) -> BytesN<32> {
    let mut b: BytesN<32> = e.prng().gen();
    let mut a = b.to_array();
    a[0] &= 0x1f; // below the field modulus
    b = BytesN::from_array(e, &a);
    b
}
fn load(e: &Env, table: u32, seat: u32) -> Seat {
    let key = Key::Seat(table, seat);
    let s: Seat = e
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(e, Error::NoSeat));
    e.storage().persistent().extend_ttl(&key, TTL_BUMP, TTL_BUMP);
    s
}
fn save(e: &Env, table: u32, seat: u32, s: &Seat) {
    e.storage().persistent().set(&Key::Seat(table, seat), s);
}
fn open_draw(e: &Env, s: &mut Seat, n: u32) {
    if s.pending.is_some() {
        panic_with_error!(e, Error::DrawPending);
    }
    s.nonce += 1;
    s.pending = Some(Pending { n, nonce: s.nonce, beacon: beacon(e) });
}

#[contract]
pub struct GrTable;

#[contractimpl]
impl GrTable {
    pub fn new_table(e: Env, host: Address, seats: u32) -> u32 {
        host.require_auth();
        let id: u32 = e.storage().instance().get(&Key::Tables).unwrap_or(0) + 1;
        e.storage().instance().set(&Key::Tables, &id);
        e.storage().instance().extend_ttl(TTL_BUMP, TTL_BUMP);
        e.storage().persistent().set(&Key::Table(id), &Table { host, seats: seats.clamp(1, 4) });
        id
    }

    /// Sit with a seed commitment H(DOM_SEED, table*16+seat, seed). The
    /// opening draw's beacon is fixed in the same call.
    pub fn sit(e: Env, table: u32, seat: u32, player: Address, seed_commit: BytesN<32>) {
        player.require_auth();
        let t: Table = e
            .storage()
            .persistent()
            .get(&Key::Table(table))
            .unwrap_or_else(|| panic_with_error!(&e, Error::NoTable));
        if seat >= t.seats || e.storage().persistent().has(&Key::Seat(table, seat)) {
            panic_with_error!(&e, Error::SeatTaken);
        }
        canonical(&e, &seed_commit);
        let mut zeros = Vec::new(&e);
        for _ in 0..T {
            zeros.push_back(0u32);
        }
        let mut s = Seat {
            player,
            seed_commit,
            deck_commit: starter_deck_commit(&e),
            deck_size: 6,
            discard: zeros,
            in_play: Vec::new(&e),
            hand: Vec::new(&e),
            nonce: 0,
            pending: None,
            round: 1,
        };
        open_draw(&e, &mut s, HAND_START);
        save(&e, table, seat, &s);
    }

    /// Finish the pending draw with a proof. Public inputs come from storage;
    /// only the new deck commitment and the slot commitments are the caller's.
    pub fn draw(
        e: Env,
        table: u32,
        seat: u32,
        proof: Bytes,
        deck_commit_new: BytesN<32>,
        slots: Vec<BytesN<32>>,
    ) {
        let mut s = load(&e, table, seat);
        s.player.require_auth();
        let p = s.pending.clone().unwrap_or_else(|| panic_with_error!(&e, Error::NoPendingDraw));
        if slots.len() != MAX_DRAW {
            panic_with_error!(&e, Error::BadSlot);
        }
        canonical(&e, &deck_commit_new);
        let discard_size: u32 = s.discard.iter().sum();
        let fold = s.deck_size < p.n && discard_size > 0;
        let available = s.deck_size + if fold { discard_size } else { 0 };
        let drawn = p.n.min(available);

        let mut pi = Bytes::new(&e);
        let mut put = |x: &BytesN<32>| pi.extend_from_array(&x.to_array());
        put(&bytes32(&e, &field(&e, table_seat(table, seat))));
        put(&s.seed_commit);
        put(&p.beacon);
        put(&bytes32(&e, &field(&e, p.nonce as u64)));
        put(&bytes32(&e, &field(&e, p.n as u64)));
        put(&bytes32(&e, &field(&e, s.deck_size as u64)));
        put(&s.deck_commit);
        for c in s.discard.iter() {
            put(&bytes32(&e, &field(&e, c as u64)));
        }
        put(&bytes32(&e, &field(&e, fold as u64)));
        put(&deck_commit_new);
        for (j, slot) in slots.iter().enumerate() {
            canonical(&e, &slot);
            let empty = slot.to_array() == [0u8; 32];
            if (j as u32) < drawn && empty || (j as u32) >= drawn && !empty {
                panic_with_error!(&e, Error::BadSlot);
            }
            put(&slot);
        }
        let verifier = UltraHonkZkVerifier::new(&e, &Bytes::from_slice(&e, VK))
            .unwrap_or_else(|_| panic_with_error!(&e, Error::BadProof));
        if verifier.verify(&proof, &pi).is_err() {
            panic_with_error!(&e, Error::BadProof);
        }

        if fold {
            let mut zeros = Vec::new(&e);
            for _ in 0..T {
                zeros.push_back(0u32);
            }
            s.discard = zeros;
        }
        s.deck_size = available - drawn;
        s.deck_commit = deck_commit_new;
        for slot in slots.iter().take(drawn as usize) {
            s.hand.push_back(slot);
        }
        s.pending = None;
        save(&e, table, seat, &s);
        e.events().publish((soroban_sdk::symbol_short!("drew"), table, seat), drawn);
    }

    /// Play the card behind hand slot `index`, revealing it. A draw card
    /// fixes the beacon for its draw in this same call.
    pub fn play(e: Env, table: u32, seat: u32, index: u32, card: u32, salt: BytesN<32>) {
        let mut s = load(&e, table, seat);
        s.player.require_auth();
        if s.pending.is_some() {
            panic_with_error!(&e, Error::DrawPending);
        }
        Self::open(&e, &mut s, index, card, &salt);
        s.in_play.push_back(card);
        match card {
            ECHOES | FORESIGHT => open_draw(&e, &mut s, 3),
            BROKERAGE => open_draw(&e, &mut s, 2),
            _ => {}
        }
        save(&e, table, seat, &s);
        e.events().publish((soroban_sdk::symbol_short!("played"), table, seat), card);
    }

    /// Round cleanup: open every remaining hand slot (the hand becomes public
    /// discard, as in 27.32), move cards in play to discard, start the next
    /// round's draw.
    pub fn cleanup(e: Env, table: u32, seat: u32, cards: Vec<u32>, salts: Vec<BytesN<32>>) {
        let mut s = load(&e, table, seat);
        s.player.require_auth();
        if s.pending.is_some() {
            panic_with_error!(&e, Error::DrawPending);
        }
        if cards.len() != s.hand.len() || salts.len() != s.hand.len() {
            panic_with_error!(&e, Error::HandNotEmpty);
        }
        for i in 0..cards.len() {
            Self::open(&e, &mut s, 0, cards.get_unchecked(i), &salts.get_unchecked(i));
            let c = cards.get_unchecked(i);
            s.discard.set(c, s.discard.get_unchecked(c) + 1);
        }
        for c in s.in_play.iter() {
            s.discard.set(c, s.discard.get_unchecked(c) + 1);
        }
        s.in_play = Vec::new(&e);
        s.round += 1;
        open_draw(&e, &mut s, HAND_START);
        save(&e, table, seat, &s);
    }

    pub fn seat(e: Env, table: u32, seat: u32) -> Seat {
        load(&e, table, seat)
    }

    /// H(DOM_SEED, table*16+seat, seed), for clients without Poseidon2.
    pub fn seed_commit_of(e: Env, table: u32, seat: u32, seed: BytesN<32>) -> BytesN<32> {
        canonical(&e, &seed);
        h(&e, vec![&e, field(&e, DOM_SEED), field(&e, table_seat(table, seat)), u256(&e, &seed)])
    }
}

impl GrTable {
    fn open(e: &Env, s: &mut Seat, index: u32, card: u32, salt: &BytesN<32>) {
        if card >= T {
            panic_with_error!(e, Error::BadCard);
        }
        canonical(e, salt);
        let slot = s.hand.get(index).unwrap_or_else(|| panic_with_error!(e, Error::BadSlot));
        let opened = h(e, vec![e, field(e, DOM_SLOT), field(e, card as u64), u256(e, salt)]);
        if opened != slot {
            panic_with_error!(e, Error::BadOpening);
        }
        s.hand.remove(index);
    }
}

#[cfg(test)]
mod test;
