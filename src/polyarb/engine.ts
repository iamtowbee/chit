import type { ArbitrageEngine, ArbLeg, Market, Opportunity } from './types.js';

/**
 * Pure arbitrage detection over a set of prediction markets.
 *
 * Two rules:
 *  1. Within-market: buying one share of every outcome of a single market
 *     pays exactly 1 when it resolves. If the outcome prices sum to < 1, that
 *     is a guaranteed profit.
 *  2. Cross-market: two markets on the same event with identical binary
 *     outcome sets resolve the same way, so buying the "Yes" leg of one and
 *     the "No" leg of the other pays exactly 1. If their prices sum to < 1,
 *     that is a guaranteed profit.
 */
export const engine: ArbitrageEngine = {
  detect(markets, options = {}) {
    const minReturn = options.minReturn ?? 0;
    const found: Opportunity[] = [];

    for (const market of markets) {
      const sum = market.outcomes.reduce((total, outcome) => total + outcome.price, 0);
      if (market.outcomes.length >= 2 && sum < 1) {
        found.push({
          type: 'within-market',
          legs: market.outcomes.map((outcome): ArbLeg => ({
            marketId: market.id,
            question: market.question,
            outcome: outcome.name,
            tokenId: outcome.tokenId,
            price: outcome.price,
          })),
          totalCost: sum,
          payout: 1,
          netReturn: (1 - sum) / sum,
          note: `buy one of each outcome on "${market.question}"`,
        });
      }
    }

    const binaries = markets.filter((market) => market.outcomes.length === 2);
    for (let i = 0; i < binaries.length; i += 1) {
      const a = binaries[i];
      if (!a || !a.eventId) continue;
      for (let j = i + 1; j < binaries.length; j += 1) {
        const b = binaries[j];
        if (!b || a.id === b.id || a.eventId !== b.eventId) continue;
        if (!sameOutcomeSet(a.outcomes.map((o) => o.name), b.outcomes.map((o) => o.name))) {
          continue;
        }
        const pairs: Array<[number, number]> = [
          [0, 1],
          [1, 0],
        ];
        for (const [ai, bi] of pairs) {
          const aOutcome = a.outcomes[ai];
          const bOutcome = b.outcomes[bi];
          if (!aOutcome || !bOutcome) continue;
          const cost = aOutcome.price + bOutcome.price;
          if (cost < 1) {
            found.push({
              type: 'cross-market',
              legs: [
                {
                  marketId: a.id,
                  question: a.question,
                  outcome: aOutcome.name,
                  tokenId: aOutcome.tokenId,
                  price: aOutcome.price,
                },
                {
                  marketId: b.id,
                  question: b.question,
                  outcome: bOutcome.name,
                  tokenId: bOutcome.tokenId,
                  price: bOutcome.price,
                },
              ],
              totalCost: cost,
              payout: 1,
              netReturn: (1 - cost) / cost,
              note: `buy "${aOutcome.name}" on "${a.question}" + "${bOutcome.name}" on "${b.question}"`,
            });
          }
        }
      }
    }

    return found
      .filter((opportunity) => opportunity.netReturn >= minReturn)
      .sort((x, y) => y.netReturn - x.netReturn);
  },
};

function sameOutcomeSet(x: string[], y: string[]): boolean {
  if (x.length !== y.length) return false;
  const sortedX = [...x].sort();
  const sortedY = [...y].sort();
  return sortedX.every((name, index) => name === sortedY[index]);
}
