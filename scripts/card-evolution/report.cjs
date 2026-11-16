// Markdown report and ranked shortlist for a card-evolution run.
const fs = require('node:fs');
const path = require('node:path');
const gen = require('./generator.cjs');

const pct = v => (v === null || v === undefined || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(0)}%`);
const pct1 = v => (v === null || v === undefined || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(1)}%`);
const signed = v => (v === null || v === undefined ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}`);
const num = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(d));
const costText = cost => (cost ? Object.entries(cost).map(([r, n]) => `${n} ${r[0].toUpperCase()}${r.slice(1)}`).join(', ') : '–');
const cell = s => String(s).replace(/\|/g, '\\|');
const groupOf = e => (e.pool === 'relic' ? e.card.affinity : e.role);
const tierOf = e => (e.pool === 'market' ? gen.tierOf(gen.priceOf(e.card.cost)) : '');

// Career = every generation a generated card played in. careerScore shrinks toward 0 by one
// pseudo-generation, so a card that kept scoring across generations outranks a one-off.
function careers(run) {
  const byKey = new Map();
  for (const g of run.generations) {
    for (const e of g.entries) {
      const s = g.stats[e.key];
      const c = byKey.get(e.key) || { entry: e, gens: [], scores: [], offers: 0, buys: 0, plays: 0, buyerDone: 0, buyerWins: 0, nonBuyerDone: 0, nonBuyerWins: 0, buyerSeats: 0, dominantIn: [], autoPickIn: [] };
      c.gens.push(g.generation); c.scores.push(s.score);
      for (const k of ['offers', 'buys', 'plays', 'buyerDone', 'buyerWins', 'nonBuyerDone', 'nonBuyerWins', 'buyerSeats']) c[k] += s[k];
      if (s.dominant) c.dominantIn.push(g.generation);
      if (s.autoPick) c.autoPickIn.push(g.generation);
      byKey.set(e.key, c);
    }
  }
  for (const c of byKey.values()) {
    c.careerScore = c.scores.reduce((a, b) => a + b, 0) / (c.scores.length + 1);
    c.pickRate = c.offers ? c.buys / c.offers : 0;
    c.buyerWinRate = c.buyerDone ? c.buyerWins / c.buyerDone : null;
    c.nonBuyerWinRate = c.nonBuyerDone ? c.nonBuyerWins / c.nonBuyerDone : null;
    c.playsPerCopy = c.buys ? c.plays / c.buys : null;
    c.lastAdjLift = run.generations.filter(g => g.stats[c.entry.key]).map(g => g.stats[c.entry.key].adjLift).pop();
    c.meanAdjLift = run.generations.filter(g => g.stats[c.entry.key]).reduce((n, g) => n + g.stats[c.entry.key].adjLift, 0) / c.gens.length;
  }
  return [...byKey.values()];
}

function shortlist(cfg, list, poolName, size) {
  const roleCap = Math.max(1, Math.ceil(size * cfg.selection.maxRoleShare));
  const eligible = list.filter(c => c.entry.pool === poolName && !c.dominantIn.length && c.buyerSeats >= cfg.shortlist.minBuyerSeats)
    .sort((a, b) => b.careerScore - a.careerScore || a.entry.key.localeCompare(b.entry.key));
  const out = [], perRole = {};
  for (const c of eligible) {
    const g = groupOf(c.entry);
    if ((perRole[g] || 0) >= roleCap) continue;
    perRole[g] = (perRole[g] || 0) + 1; out.push(c);
    if (out.length >= size) break;
  }
  return out;
}

function cardRow(c, rank) {
  const e = c.entry, card = e.card;
  return `| ${rank} | ${cell(card.code)} | **${cell(card.name)}** | ${groupOf(e)}${e.pool === 'market' ? ` / ${tierOf(e)}` : ''} | ${e.pool === 'market' ? costText(card.cost) : '–'} | ${cell(card.text)} | ${c.gens.join(',')} | ${c.offers} | ${pct1(c.pickRate)} | ${c.buyerSeats} | ${pct(c.buyerWinRate)} | ${pct(c.nonBuyerWinRate)} | ${signed(c.meanAdjLift)} | ${num(c.playsPerCopy)} | ${num(c.careerScore, 2)} |`;
}
const CARD_HEAD = '| # | Code | Card | Role / tier | Price | Text | Gens | Offers | Pick | Buyers | Buyer win | Non-buyer win | Adj. lift (pts) | Plays/copy | Score |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';

function generationTable(run) {
  const rows = [];
  const line = (label, g) => {
    const s = g.summary, t = s.buysByTier, total = t.expensive + t.medium + t.cheap || 1;
    rows.push(`| ${label} | ${s.completed}/${s.games} | ${num(s.meanRounds)} (${num(s.medianRounds, 0)}) | ${num(s.buysPerGame)} | ${num(s.relicsPerGame)} | ${pct1(s.marketPick)} | ${pct(s.relicPick)} | ${pct(t.expensive / total)} / ${pct(t.medium / total)} / ${pct(t.cheap / total)} | ${s.winsByProfile.military}/${s.winsByProfile.economy}/${s.winsByProfile.expansion} | ${s.dominant.length} | ${g.kept ? g.kept.length : '–'} | ${num(g.seconds, 0)}s |`);
  };
  if (run.baseline) line('G0 printed', run.baseline);
  for (const g of run.generations) line(`G${g.generation}`, g);
  return '| Gen | Finished | Rounds mean (median) | Buys/game | Relics/game | Market pick | Relic pick | Buys E / M / C | Wins mil/eco/exp | Dominant | Kept | Wall |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n');
}

function baselineTable(run) {
  if (!run.baseline) return '_No printed-card baseline in this run (baselineGames = 0)._';
  const b = run.baseline;
  const rows = [...b.entries].sort((x, y) => b.stats[y.key].score - b.stats[x.key].score).map(e => {
    const s = b.stats[e.key];
    return `| ${cell(e.card.code || '')} | ${cell(e.card.name)} | ${groupOf(e) || e.card.kind}${e.pool === 'market' ? ` / ${tierOf(e)}` : ''} | ${s.offers} | ${pct1(s.pickRate)} | ${s.buyerSeats} | ${pct(s.buyerWinRate)} | ${pct(s.nonBuyerWinRate)} | ${signed(s.adjLift)} | ${num(s.playsPerCopy)} | ${num(s.score, 2)}${s.dominant ? ' ⚠' : ''} |`;
  });
  return '| Code | Card | Role / tier | Offers | Pick | Buyers | Buyer win | Non-buyer win | Adj. lift (pts) | Plays/copy | Score |\n|---|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n');
}

function renderReport(cfg, run) {
  const list = careers(run);
  const market = shortlist(cfg, list, 'market', cfg.shortlist.market), relics = shortlist(cfg, list, 'relic', cfg.shortlist.relics);
  const flagged = list.filter(c => c.dominantIn.length).sort((a, b) => b.buyerWinRate - a.buyerWinRate);
  const last = run.generations[run.generations.length - 1];
  const r = run.rules;
  const lines = [];
  lines.push(`# Card evolution: ${run.name}`, '');
  lines.push(`Run ${run.startedAt.slice(0, 16).replace('T', ' ')} UTC – ${run.finishedAt.slice(0, 16).replace('T', ' ')} UTC, wall time **${(run.wallSeconds / 60).toFixed(1)} min** on ${run.workers} worker threads (${run.node}).`, '');
  lines.push(`- Study code: \`scripts/card-evolution\` at \`${run.tooling}\`.`);
  lines.push(`- Rules source: \`${r.ref}\` at \`${r.commit}\`${r.dirty ? ' (with uncommitted engine edits)' : ''}, engine \`${r.rulesVersion}\`, ${r.tieredMarket ? 'tiered market' : 'single market row'}.${r.extra ? ` ${r.extra}` : ''}`);
  lines.push(`- ${cfg.generations} generations × ${cfg.gamesPerGeneration} all-rival games${run.baseline ? `, plus ${cfg.baselineGames} games with the printed cards (G0) as a reference` : ''}. Victory at ${cfg.victoryTarget} Prestige, cap ${cfg.maxRound} rounds. Seeds ${cfg.seed} + 7919·i; the same seeds and lineups every generation.`);
  lines.push(`- Pools: ${cfg.pool.market.size} market designs (×2 copies) and ${cfg.pool.relics.size} relics. Each generation keeps the best ${pct(cfg.selection.keepFraction)} of each pool (no dominant cards; at most ${pct(cfg.selection.maxRoleShare)} of the kept cards per role) and refills to the role/tier quotas, ${pct(cfg.selection.mutationShare)} of the new cards as one-field variants of survivors.`);
  lines.push('', '**The shortlist is for the captain to choose from. The study never changes the printed card set; promoting a card is a manual, rules-reviewed edit (see scripts/card-evolution/README.md).**', '');
  lines.push('## How to read the numbers', '');
  lines.push('- **Pick**: copies bought ÷ offers (an offer is one faction’s Buy turn with the design face up; for relics, one excavation with the relic in the row).');
  lines.push('- **Buyer win / Non-buyer win**: win rate of factions that bought it vs. factions that were offered it and passed (finished games). Four factions, so 25% is par.');
  lines.push('- **Adj. lift**: smoothed buyer-minus-non-buyer win rate, minus the pool median (buying anything correlates with winning). In percentage points.');
  lines.push('- **Score**: ½ z(pick) + ½ z(adj. lift) within each generation; the shortlist ranks the career score (sum of generation scores ÷ (generations + 1)).');
  lines.push(`- **Dominant**: ≥${cfg.dominance.minBuyerSeats} buyers, buyer win ≥${pct(cfg.dominance.buyerWinRate)} and adj. lift ≥${(cfg.dominance.liftOverPool * 100).toFixed(0)} pts. Flagged as overpowered and dropped, never shortlisted.`, '');
  lines.push('## Per-generation trends', '', generationTable(run), '');
  lines.push(`## Ranked shortlist: market (${market.length})`, '', CARD_HEAD, ...market.map((c, i) => cardRow(c, i + 1)), '');
  lines.push(`## Ranked shortlist: relics (${relics.length})`, '', CARD_HEAD.replace('Pick | Buyers | Buyer win | Non-buyer win', 'Pick | Pickers | Picker win | Passed-on win'), ...relics.map((c, i) => cardRow(c, i + 1)), '');
  lines.push(`## Flagged dominant (${flagged.length})`, '');
  lines.push(flagged.length ? CARD_HEAD + '\n' + flagged.map((c, i) => cardRow(c, i + 1)).join('\n') : '_None._', '');
  if (last) {
    lines.push(`## Final pool (G${last.generation}) by score`, '');
    const finalRows = [...last.entries].sort((a, b) => last.stats[b.key].score - last.stats[a.key].score).map(e => {
      const s = last.stats[e.key];
      return `| ${cell(e.card.code)} | ${cell(e.card.name)} | ${groupOf(e)}${e.pool === 'market' ? ` / ${tierOf(e)}` : ''} | ${e.pool === 'market' ? costText(e.card.cost) : '–'} | ${e.card.origin?.source}${e.card.origin?.parent ? ` of ${e.card.origin.parent}` : ''} | ${pct(s.pickRate)} | ${pct(s.buyerWinRate)} | ${signed(s.adjLift)} | ${num(s.score, 2)}${s.dominant ? ' ⚠' : ''} |`;
    });
    lines.push('| Code | Card | Role / tier | Price | Origin | Pick | Buyer win | Adj. lift | Score |\n|---|---|---|---|---|---|---|---|---|\n' + finalRows.join('\n'), '');
  }
  lines.push('## Reference: printed cards (G0)', '', baselineTable(run), '');
  lines.push('## Caveats', '');
  lines.push('- **AI-policy bias.** Every seat is the browser rival. It values cards by a few generic signals (draws, Prestige, limits, order type, military power) and does not price range, assault, build discounts, colony terms, production or resource gains individually. Cards whose strength the rival cannot see are under-bought and under-played; a card the rival over-values looks popular without being strong. Read pick rate as “the rival wants it”, not “players will”.');
  lines.push('- **Correlation, not causation.** Lift compares factions that bought a card with those that passed. Strong factions buy more; the pool-median adjustment removes the average effect, not card-specific selection (e.g. only already-winning factions can afford 14-price Wonders).');
  lines.push('- **Noise.** About 200 games per generation gives each design a few hundred offers but only tens of buyer seats; a ±10-point lift is within noise for a card bought by ~30 factions. Prefer cards that kept a positive score over several generations.');
  lines.push('- **Generated wording is mechanical.** Names and text are composed from templates; review wording before printing.');
  lines.push('- **Power model.** Prices come from a hand-fitted model of the printed market plus a ±15% random markup, so some survivors are simply underpriced versions of printed effects. Check price against the printed equivalent before promoting.', '');
  lines.push('## Files', '', '- `generations.csv`: one row per card per generation (all stats).', '- `gen-<n>/pool.json`, `games.jsonl`, `cards.csv`, `cards.json`, `selection.json`: the pool, every game record, card stats and the keep/drop decisions.', '- `config.json`, `run.json`: resolved config, rules commit, wall times and the shortlist.', '');
  return { markdown: lines.join('\n'), shortlist: { market: market.map(c => c.entry.key), relics: relics.map(c => c.entry.key), flagged: flagged.map(c => c.entry.key) }, careers: list };
}

function writeReport(cfg, run, out) {
  const report = renderReport(cfg, run);
  fs.writeFileSync(path.join(out, 'report.md'), report.markdown);
  const header = 'pool,rank,key,code,name,role,tier,cost,generations,offers,pickRate,buyerSeats,buyerWinRate,nonBuyerWinRate,meanAdjLift,playsPerCopy,careerScore,text';
  const rows = [];
  for (const poolName of ['market', 'relic']) {
    report.careers.filter(c => c.entry.pool === poolName && (poolName === 'market' ? report.shortlist.market : report.shortlist.relics).includes(c.entry.key))
      .sort((a, b) => b.careerScore - a.careerScore)
      .forEach((c, i) => { const e = c.entry; rows.push([poolName, i + 1, e.key, e.card.code, e.card.name, groupOf(e), tierOf(e), costText(e.card.cost), c.gens.join(' '), c.offers, c.pickRate.toFixed(4), c.buyerSeats, c.buyerWinRate?.toFixed(4) ?? '', c.nonBuyerWinRate?.toFixed(4) ?? '', c.meanAdjLift.toFixed(4), c.playsPerCopy?.toFixed(2) ?? '', c.careerScore.toFixed(4), e.card.text].map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')); });
  }
  fs.writeFileSync(path.join(out, 'shortlist.csv'), [header, ...rows].join('\n') + '\n');
  // Promotion helper: the shortlisted cards' rule fields, ready to copy into app.js by hand.
  const pick = keys => Object.fromEntries(report.careers.filter(c => keys.includes(c.entry.key)).map(c => [c.entry.key, c.entry.card]));
  fs.writeFileSync(path.join(out, 'shortlist-cards.json'), JSON.stringify({ market: pick(report.shortlist.market), relics: pick(report.shortlist.relics) }, null, 2));
  return report;
}

module.exports = { writeReport, renderReport, careers, shortlist };
