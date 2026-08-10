import type { Market, Outcome } from './types.js';

/** A source of markets, either live or simulated. */
export interface MarketDataSource {
  next(): Promise<Market[]>;
}

interface GammaMarket {
  id: string;
  conditionId?: string;
  question?: string;
  active?: boolean;
  closed?: boolean;
  outcomes?: string[];
  outcomePrices?: string[];
  clobTokenIds?: string[];
  volume24hr?: number;
  liquidity?: number;
}

interface GammaEvent {
  id: string | number;
  markets?: GammaMarket[];
}

/**
 * Reads live markets from Polymarket's public gamma API. Read-only: no API
 * key is required. Each market's prices are parsed from `outcomePrices`.
 */
export class HttpPolyClient implements MarketDataSource {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    baseUrl = 'https://gamma-api.polymarket.com',
    fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async next(limit = 40): Promise<Market[]> {
    const url = `${this.baseUrl}/events?limit=${limit}&active=true&closed=false`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`polymarket gamma API responded HTTP ${res.status}`);
    }
    const events = (await res.json()) as GammaEvent[];
    const markets: Market[] = [];
    for (const event of events) {
      const eventId = String(event.id);
      for (const raw of event.markets ?? []) {
        if (!raw.active || raw.closed) continue;
        const outcomes = parseOutcomes(raw);
        if (outcomes.length < 2) continue;
        markets.push({
          id: raw.conditionId ?? raw.id,
          eventId,
          question: raw.question ?? '',
          outcomes,
          volume: raw.volume24hr,
          liquidity: raw.liquidity,
        });
      }
    }
    return markets;
  }
}

function parseOutcomes(raw: GammaMarket): Outcome[] {
  const names = raw.outcomes ?? [];
  const prices = raw.outcomePrices ?? [];
  const tokenIds = raw.clobTokenIds ?? [];
  const outcomes: Outcome[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const price = Number(prices[i]);
    if (!name || !Number.isFinite(price) || price <= 0 || price >= 1) continue;
    outcomes.push({
      name,
      price,
      tokenId: tokenIds[i] !== undefined ? tokenIds[i] : undefined,
    });
  }
  return outcomes;
}
