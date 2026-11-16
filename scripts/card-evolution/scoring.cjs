// Per-card statistics, scores, dominance flags and survivor selection.
//
// Definitions (one "seat" = one faction in one game):
//   offers      market: Buy turns in which the design was face up for that faction;
//               relics: excavations at which the relic was in the relic row.
//   pick rate   copies bought (relics: times chosen) / offers.
//   buyers      seats that bought at least one copy; non-buyers: seats offered it that did not.
//   lift        smoothed buyer win rate - smoothed non-buyer win rate (completed games only).
//   adj. lift   lift minus the pool's median lift: buying anything correlates with winning,
//               because winning factions are richer, so only the excess is credited.
//   score       pickWeight * z(pick rate) + winWeight * z(adj. lift), z within the pool.
//   dominant    enough buyers, buyer win rate >= dominance.buyerWinRate and adj. lift >=
//               dominance.liftOverPool: "near-always wins". Flagged, never kept as best.

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) || 1; };

function cardStats(games, pool, entries) {
  const isRelic = pool === 'relic';
  const offersKey = isRelic ? 'relicOffers' : 'offers', buysKey = isRelic ? 'relicPicks' : 'buys';
  const stats = {};
  for (const entry of entries) stats[entry.key] = { key: entry.key, offers: 0, buys: 0, plays: 0, offeredSeats: 0, buyerSeats: 0, buyerWins: 0, buyerDone: 0, nonBuyerSeats: 0, nonBuyerWins: 0, nonBuyerDone: 0, gamesBought: 0, firstRounds: [], buyerGameRounds: [] };
  for (const g of games) {
    for (const entry of entries) {
      const st = stats[entry.key];
      let boughtThisGame = false;
      for (let seat = 0; seat < 4; seat++) {
        const offered = g[offersKey][seat][entry.key] || 0, bought = g[buysKey][seat][entry.key] || 0;
        st.offers += offered; st.buys += bought; st.plays += g.plays[seat][entry.key] || 0;
        if (offered) st.offeredSeats++;
        const won = g.completed && g.winner === seat;
        if (bought) {
          boughtThisGame = true; st.buyerSeats++;
          if (g.completed) { st.buyerDone++; if (won) st.buyerWins++; st.buyerGameRounds.push(g.round); }
          if (!isRelic && g.firstBuyRound[seat][entry.key] !== undefined) st.firstRounds.push(g.firstBuyRound[seat][entry.key]);
        } else if (offered) {
          st.nonBuyerSeats++;
          if (g.completed) { st.nonBuyerDone++; if (won) st.nonBuyerWins++; }
        }
      }
      if (boughtThisGame) st.gamesBought++;
    }
  }
  return stats;
}

function score(stats, entries, cfg) {
  const prior = cfg.scoring.priorSeats, base = 0.25;
  const list = entries.map(e => stats[e.key]);
  const poolPick = list.reduce((n, s) => n + s.buys, 0) / Math.max(1, list.reduce((n, s) => n + s.offers, 0));
  for (const s of list) {
    s.pickRate = s.offers ? s.buys / s.offers : 0;
    s.pickSmoothed = (s.buys + cfg.scoring.priorOffers * poolPick) / (s.offers + cfg.scoring.priorOffers);
    s.buyerWinRate = s.buyerDone ? s.buyerWins / s.buyerDone : null;
    s.nonBuyerWinRate = s.nonBuyerDone ? s.nonBuyerWins / s.nonBuyerDone : null;
    s.lift = (s.buyerWins + prior * base) / (s.buyerDone + prior) - (s.nonBuyerWins + prior * base) / (s.nonBuyerDone + prior);
    s.playsPerCopy = s.buys ? s.plays / s.buys : null;
    s.meanFirstBuyRound = s.firstRounds.length ? mean(s.firstRounds) : null;
    s.evidence = s.offers >= cfg.scoring.minOffers;
  }
  const withEvidence = list.filter(s => s.evidence);
  const poolLift = median(withEvidence.map(s => s.lift));
  for (const s of list) s.adjLift = s.lift - poolLift;
  const picks = withEvidence.map(s => s.pickSmoothed), lifts = withEvidence.map(s => s.adjLift);
  const [mp, sp, ml, sl] = [mean(picks), sd(picks), mean(lifts), sd(lifts)];
  for (const s of list) {
    s.pickZ = (s.pickSmoothed - mp) / sp;
    s.liftZ = (s.adjLift - ml) / sl;
    s.score = s.evidence ? cfg.scoring.pickWeight * s.pickZ + cfg.scoring.winWeight * s.liftZ : 0;
    const d = cfg.dominance;
    s.dominant = s.buyerDone >= d.minBuyerSeats && s.buyerWinRate >= d.buyerWinRate && s.adjLift >= d.liftOverPool;
    s.autoPick = s.evidence && s.pickRate >= d.autoPickRate;
  }
  return { poolPick, poolLift };
}

// Keep the best non-dominant cards, at most `quota[role]` of each role, up to `keep`.
function selectSurvivors(entries, stats, keep, quotaOf) {
  const ranked = [...entries].sort((a, b) => stats[b.key].score - stats[a.key].score || a.key.localeCompare(b.key));
  const kept = [], perRole = {}, dropped = [];
  for (const entry of ranked) {
    const s = stats[entry.key], group = quotaOf.groupOf(entry);
    let reason = null;
    if (s.dominant) reason = 'dominant (flagged overpowered)';
    else if (kept.length >= keep) reason = 'below the cut';
    else if ((perRole[group] || 0) >= quotaOf.quota(group)) reason = `role cap (${group})`;
    if (reason) { dropped.push({ key: entry.key, reason }); continue; }
    kept.push(entry); perRole[group] = (perRole[group] || 0) + 1;
  }
  return { kept, dropped };
}

module.exports = { cardStats, score, selectSurvivors, mean, median };
