import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ContinueClient } from '../src/client.js';
import { JsonFileStore } from '../src/store.js';
import { engine } from '../src/polyarb/engine.js';
import { HttpPolyClient } from '../src/polyarb/polyclient.js';
import { runPolyarb } from '../src/polyarb/bot.js';
import { SimExecutor } from '../src/polyarb/execute.js';
import { Simulator } from '../src/polyarb/simulator.js';
import type { Market } from '../src/polyarb/types.js';

describe('arbitrage engine', () => {
  it('detects within-market arbitrage (binary)', () => {
    const markets: Market[] = [
      {
        id: 'm1',
        eventId: 'e1',
        question: 'Will X?',
        outcomes: [
          { name: 'Yes', price: 0.45 },
          { name: 'No', price: 0.5 },
        ],
      },
    ];
    const found = engine.detect(markets);
    expect(found).toHaveLength(1);
    expect(found[0]!.type).toBe('within-market');
    expect(found[0]!.totalCost).toBeCloseTo(0.95);
    expect(found[0]!.netReturn).toBeCloseTo((1 - 0.95) / 0.95);
    expect(found[0]!.legs).toHaveLength(2);
  });

  it('detects within-market arbitrage with 3 outcomes', () => {
    const markets: Market[] = [
      {
        id: 'm2',
        question: 'Who wins?',
        outcomes: [
          { name: 'A', price: 0.3 },
          { name: 'B', price: 0.3 },
          { name: 'C', price: 0.3 },
        ],
      },
    ];
    const found = engine.detect(markets);
    expect(found).toHaveLength(1);
    expect(found[0]!.legs).toHaveLength(3);
  });

  it('detects cross-market arbitrage on the same event', () => {
    const markets: Market[] = [
      {
        id: 'a',
        eventId: 'e1',
        question: 'Will X?',
        outcomes: [
          { name: 'Yes', price: 0.4 },
          { name: 'No', price: 0.6 },
        ],
      },
      {
        id: 'b',
        eventId: 'e1',
        question: 'Will X?',
        outcomes: [
          { name: 'Yes', price: 0.55 },
          { name: 'No', price: 0.45 },
        ],
      },
    ];
    const found = engine.detect(markets);
    const cross = found.filter((o) => o.type === 'cross-market');
    expect(cross).toHaveLength(1);
    expect(cross[0]!.totalCost).toBeCloseTo(0.85);
    expect(cross[0]!.netReturn).toBeCloseTo((1 - 0.85) / 0.85);
  });

  it('finds nothing when prices are honest', () => {
    const markets: Market[] = [
      {
        id: 'm1',
        eventId: 'e1',
        question: 'Will X?',
        outcomes: [
          { name: 'Yes', price: 0.55 },
          { name: 'No', price: 0.55 },
        ],
      },
      {
        id: 'm2',
        eventId: 'e2',
        question: 'Will Y?',
        outcomes: [
          { name: 'Yes', price: 0.5 },
          { name: 'No', price: 0.5 },
        ],
      },
    ];
    expect(engine.detect(markets)).toHaveLength(0);
  });

  it('applies a minimum return threshold', () => {
    const markets: Market[] = [
      {
        id: 'm1',
        question: 'Will X?',
        outcomes: [
          { name: 'Yes', price: 0.45 },
          { name: 'No', price: 0.5 },
        ],
      },
    ];
    expect(engine.detect(markets, { minReturn: 0.2 })).toHaveLength(0);
  });
});

describe('simulator', () => {
  it('produces valid markets with arbitrage windows over time', async () => {
    const sim = new Simulator({ seed: 42, events: 12 });
    let total = 0;
    for (let i = 0; i < 15; i += 1) {
      const markets = await sim.next();
      for (const market of markets) {
        expect(market.outcomes).toHaveLength(2);
        for (const outcome of market.outcomes) {
          expect(outcome.price).toBeGreaterThan(0);
          expect(outcome.price).toBeLessThan(1);
        }
      }
      total += engine.detect(markets).length;
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe('bot on the continue API', () => {
  let dataDir: string;
  let apiServer: http.Server;
  let client: ContinueClient;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-polyarb-'));
    const { app } = createApp({ store: new JsonFileStore(dataDir) });
    apiServer = http.createServer(app);
    await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
    const { port } = apiServer.address() as AddressInfo;
    client = new ContinueClient({ baseUrl: `http://127.0.0.1:${port}` });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      apiServer.close((err) => (err ? reject(err) : resolve())),
    );
    await rm(dataDir, { recursive: true, force: true });
  });

  it('runs a scan session to completion with checkpoints', async () => {
    const { session, found } = await runPolyarb({
      client,
      mode: 'sim',
      iterations: 3,
      intervalMs: 0,
      minReturn: 0.005,
      seed: 7,
    });
    expect(session.status).toBe('done');
    expect(session.currentStep).toBe(3);
    expect(session.checkpoints).toHaveLength(3);
    expect(found).toBeGreaterThan(0);
    expect(session.metadata.app).toBe('polyarb');
  });

  it('resumes from the last checkpoint after an interruption', async () => {
    let firstError: unknown;
    try {
      await runPolyarb({
        client,
        mode: 'sim',
        iterations: 5,
        intervalMs: 0,
        minReturn: 0.005,
        seed: 7,
        onIteration: async (iteration) => {
          if (iteration === 3) throw new Error('simulated crash');
        },
      });
    } catch (err) {
      firstError = err;
    }
    expect(firstError).toBeInstanceOf(Error);
    const interrupted = await client.list();
    const session = interrupted[0]!;
    expect(session.status).toBe('active');
    expect(session.currentStep).toBe(3);

    const { session: resumed } = await runPolyarb({
      client,
      mode: 'sim',
      iterations: 5,
      intervalMs: 0,
      minReturn: 0.005,
      seed: 7,
      sessionId: session.id,
    });
    expect(resumed.status).toBe('done');
    expect(resumed.currentStep).toBe(5);
    expect(resumed.checkpoints).toHaveLength(5);
  });
});

describe('real client', () => {
  it('parses markets from the gamma API shape', async () => {
    const payload = [
      {
        id: 100,
        markets: [
          {
            id: 'mk-1',
            conditionId: '0xabc',
            active: true,
            closed: false,
            question: 'Will it rain?',
            outcomes: ['Yes', 'No'],
            outcomePrices: ['0.4', '0.6'],
            clobTokenIds: ['tok-yes', 'tok-no'],
            volume24hr: 123,
            liquidity: 456,
          },
          {
            id: 'mk-2',
            conditionId: '0xdef',
            active: false,
            question: 'Inactive?',
            outcomes: ['Yes', 'No'],
            outcomePrices: ['0.5', '0.5'],
          },
        ],
      },
    ];
    const client = new HttpPolyClient('http://fake', async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    const markets = await client.next();
    expect(markets).toHaveLength(1);
    expect(markets[0]!.id).toBe('0xabc');
    expect(markets[0]!.eventId).toBe('100');
    expect(markets[0]!.outcomes[0]).toEqual({
      name: 'Yes',
      price: 0.4,
      tokenId: 'tok-yes',
    });
  });

  it('sim executor fills legs', async () => {
    const executor = new SimExecutor();
    const fill = await executor.placeLeg(
      { marketId: 'm', question: 'q', outcome: 'Yes', price: 0.4 },
      100,
    );
    expect(fill.filled).toBe(true);
    expect(fill.note).toContain('@ 0.4');
  });
});
