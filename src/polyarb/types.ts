export interface Outcome {
  name: string;
  price: number;
  tokenId?: string;
}

export interface Market {
  id: string;
  eventId?: string;
  question: string;
  outcomes: Outcome[];
  volume?: number;
  liquidity?: number;
}

export type ArbType = 'within-market' | 'cross-market';

export interface ArbLeg {
  marketId: string;
  question: string;
  outcome: string;
  tokenId?: string;
  price: number;
}

export interface Opportunity {
  type: ArbType;
  legs: ArbLeg[];
  /** Cost per share of the complete set. */
  totalCost: number;
  /** Guaranteed payout per share of the complete set. */
  payout: number;
  /** (payout - cost) / cost. */
  netReturn: number;
  note: string;
}

export interface ScanResult {
  markets: number;
  opportunities: Opportunity[];
  bestReturn: number | null;
  scannedAt: string;
}

export interface ArbitrageEngine {
  detect(markets: Market[], options?: { minReturn?: number }): Opportunity[];
}

export function summarize(result: ScanResult): string {
  const best = result.bestReturn === null ? 'none' : `${(result.bestReturn * 100).toFixed(2)}%`;
  return `${result.markets} markets, ${result.opportunities.length} arbs (best ${best})`;
}
