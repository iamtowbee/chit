import type { Market, Outcome } from './types.js';

export interface SimulatorOptions {
  seed?: number;
  /** Number of synthetic events (each with one or two markets). */
  events?: number;
}

interface SimMarket {
  id: string;
  eventId: string;
  question: string;
  trueProb: number;
  prices: [number, number];
  /** Second market on the same event with identical outcomes (for cross-market arbs). */
  twin?: SimMarket;
}

/**
 * Fully offline prediction-market data source. Generates synthetic events with
 * hidden "true" probabilities; market prices drift around the truth and, on
 * some ticks, a mispricing is injected so the detection engine finds real
 * within-market and cross-market arbitrage opportunities.
 */
export class Simulator {
  private readonly rng: () => number;
  private readonly markets: SimMarket[];

  constructor(options: SimulatorOptions = {}) {
    const seed = options.seed ?? 1;
    const eventCount = options.events ?? 12;
    this.rng = mulberry32(seed);
    this.markets = [];
    for (let i = 0; i < eventCount; i += 1) {
      this.addEvent(i, i % 3 === 0);
    }
  }

  private addEvent(index: number, withTwin: boolean): void {
    const eventId = `sim-event-${index}`;
    const question = `Simulated event ${index}: will the outcome happen?`;
    const trueProb = round2(0.05 + this.rng() * 0.9);
    const primary = this.newMarket(eventId, index, question, trueProb, withTwin);
    this.markets.push(primary);
    if (withTwin) {
      const twin = this.newMarket(eventId, index, question, trueProb, false);
      primary.twin = twin;
      this.markets.push(twin);
    }
  }

  private newMarket(
    eventId: string,
    index: number,
    question: string,
    trueProb: number,
    hasTwin: boolean,
  ): SimMarket {
    const price = clamp(trueProb + (this.rng() - 0.5) * 0.08, 0.02, 0.98);
    const twinSuffix = hasTwin ? ' (A)' : '';
    return {
      id: `${eventId}-mkt-${hasTwin ? 'a' : this.markets.length}`,
      eventId,
      question: `${question}${twinSuffix}`,
      trueProb,
      prices: [round2(price), round2(1 - price)],
    };
  }

  /** Advance one tick and return the current set of markets. */
  async next(): Promise<Market[]> {
    for (const market of this.markets) {
      this.drift(market);
      if (this.rng() < 0.18) {
        // Inject a mispricing: underpriced Yes on a random market.
        market.prices[0] = round2(market.trueProb * (0.9 + this.rng() * 0.06));
        market.prices[1] = round2(1 - market.prices[0]);
      }
      if (market.twin && this.rng() < 0.22) {
        // Drive the twin apart to create a cross-market window.
        const offset = round2(market.trueProb * (0.06 + this.rng() * 0.05));
        market.twin.prices[0] = round2(market.prices[0] + offset);
        market.twin.prices[1] = round2(1 - market.twin.prices[0]);
      }
      if (this.rng() < 0.1) {
        // Within-market slip: No underpriced so Yes+No sums below 1.
        market.prices[1] = round2(market.prices[1] * 0.97);
      }
    }
    return this.markets.map((market): Market => {
      const outcomes: Outcome[] = [
        { name: 'Yes', price: market.prices[0] },
        { name: 'No', price: market.prices[1] },
      ];
      return {
        id: market.id,
        eventId: market.eventId,
        question: market.question,
        outcomes,
      };
    });
  }

  private drift(market: SimMarket): void {
    const noise = (this.rng() - 0.5) * 0.06;
    market.prices[0] = round2(clamp(market.prices[0] + noise, 0.02, 0.98));
    market.prices[1] = round2(1 - market.prices[0]);
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
