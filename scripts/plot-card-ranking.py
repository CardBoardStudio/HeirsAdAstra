"""Plot a verified card-ranking analysis; this does not run or modify games."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('analysis', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists(), 'Keep earlier plots'
report = json.loads(args.analysis.read_text())
cards = report['rankings']
y = np.arange(len(cards))
colors = ['#9b9b98' if c['purchases'] == 0 else '#28775b' if c['prestige95'][0] > 0
          else '#b14b36' if c['prestige95'][1] < 0 else '#315f80' for c in cards]
fig, (effects, buys) = plt.subplots(1, 2, figsize=(14, 15), sharey=True,
                                   gridspec_kw={'width_ratios': [3.4, 1]})
fig.patch.set_facecolor('#faf9f4')
for ax in (effects, buys):
    ax.set_facecolor('#faf9f4')
    ax.spines[['top', 'right', 'left']].set_visible(False)
    ax.tick_params(axis='both', labelsize=11, length=0, pad=8)
    ax.set_axisbelow(True)
    ax.grid(axis='x', color='#dce1df', linewidth=.7)
for i, (card, color) in enumerate(zip(cards, colors)):
    lo, hi = card['prestige95']
    if card['purchases']:
        effects.plot([lo, hi], [i, i], color=color, linewidth=2, solid_capstyle='round')
        effects.scatter(card['prestigeGain'], i, color=color, s=35, zorder=3)
    else:
        effects.scatter(0, i, facecolor='#faf9f4', edgecolor=color, s=35, zorder=3)
    buys.barh(i, card['purchases'], height=.5, color=color, alpha=.8)
    buys.text(card['purchases'] + 1, i, str(card['purchases']), va='center', fontsize=10, color='#253741')
effects.axvline(0, color='#6e7e82', linewidth=1)
effects.set_yticks(y, [c['name'] + (' *' if c.get('missingMapBlocks') else '') + ('  [not bought]' if not c['purchases'] else '') for c in cards])
effects.invert_yaxis()
effects.set_xlabel('Prestige benefit of retaining access (mean and exploratory 95% interval)', fontsize=11, labelpad=15)
buys.set_xlabel('Baseline purchases', fontsize=11, labelpad=15)
buys.tick_params(axis='y', labelleft=False)
buys.set_xlim(0, max(c['purchases'] for c in cards) * 1.28 + 1)
fig.suptitle('Which cards help the Market bots?', x=.03, ha='left', y=.98,
             fontsize=24, fontweight='bold', color='#172f3b')
fig.text(.03, .945,
         f"{report['completedGames']:,}/{report.get('plannedGames',report['completedGames']):,} games · {len(report['protocol']['seedList'])} maps · "
         f"{report['protocol']['target']}-Prestige goal · four Market bots · full finite catalog",
         fontsize=12, color='#465d68')
fig.text(.03, .021,
         ('* Incomplete map blocks excluded for flagged cards; see the report for coverage.\n' if report.get('missingCases') else 'Positive values favor access; negative values favor withholding the card from one bot.\n')
         + 'Whole maps are bootstrap units. Intervals are not corrected for comparing 34 cards.\n'
         'Rarely bought cards have limited evidence. Substitutes remain available; this is not a universal human tier list.',
         fontsize=11, linespacing=1.5, color='#465d68')
fig.subplots_adjust(left=.25, right=.97, bottom=.11, top=.915, wspace=.12)
args.output.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(args.output, dpi=160, facecolor=fig.get_facecolor())
plt.close(fig)
print(args.output)
