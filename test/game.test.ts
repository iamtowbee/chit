import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlatform } from '../src/platform.js';
import { SessionService } from '../src/service.js';
import { JsonFileStore } from '../src/store.js';
import { BotRunner } from '../src/game/bot.js';
import {
  applyChoice,
  availableChoices,
  initialState,
  interpolate,
  isTerminal,
  nodeAt,
  progress,
} from '../src/game/engine.js';
import {
  buildPlays,
  buildPlaysFromSnapshot,
  initialMarketGame,
  isBakePhase,
  resolveMarketPlay,
  type MarketGameData,
} from '../src/game/market.js';
import {
  cryptoPriceOf,
  initialCryptoGame,
  isCryptoBake,
  resolveCryptoPlay,
} from '../src/game/crypto.js';
import {
  MILLION_FIFTY,
  MILLION_ROUNDS,
  MILLION_TIERS,
  MILLION_WALK,
  initialMillionGame,
  isMillionBake,
  resolveMillionPlay,
} from '../src/game/million.js';
import { NODES } from '../src/game/story.js';

function pick(data: ReturnType<typeof initialState>, to: string): number {
  const choices = availableChoices(nodeAt(data), data);
  const index = choices.findIndex((c) => c.to === to);
  if (index < 0) throw new Error(`no available choice to '${to}'`);
  return index;
}

function go(
  data: ReturnType<typeof initialState>,
  ...targets: string[]
): ReturnType<typeof initialState> {
  let d = data;
  for (const t of targets) d = applyChoice(d, pick(d, t));
  return d;
}

describe('game engine — It\'s Cak', () => {
  it('starts at the oven with no ingredients', () => {
    const data = initialState();
    expect(data.nodeId).toBe('start');
    expect(data.moves).toBe(0);
    expect(data.inventory).toEqual([]);
    expect(data.outcome).toBeNull();
    expect(isTerminal(data)).toBe(false);
    expect(progress(data)).toBeGreaterThan(0);
  });

  it('rejects a choice index that is not available', () => {
    const data = initialState();
    const choices = availableChoices(nodeAt(data), data);
    expect(() => applyChoice(data, choices.length)).toThrow(/not available/);
    expect(() => applyChoice(data, -1)).toThrow(/not available/);
  });

  it('rejects acting on a finished game', () => {
    const data = go(initialState(), 'frost_gate', 'frost_greedy');
    expect(data.outcome).toBe('lose');
    expect(() => applyChoice(data, 0)).toThrow(/already ended/);
  });

  it('walks the friendly win path and collects every ingredient', () => {
    const data = go(
      initialState(),
      'elders',
      'frost_gate',
      'frost_accept',
      'jam_gate',
      'berry_gift',
      'kiln_gate',
      'kiln_blessed',
      'grand_bake',
      'win_end',
    );
    expect(data.outcome).toBe('win');
    expect(data.inventory).toEqual([
      'crumb_blessing',
      'sugar_dust',
      'whispering_berry',
      'yeast_spark',
    ]);
    const text = interpolate(NODES.win_end.text, data);
    expect(text).toContain('Cak');
  });

  it('records the chosen name in the winning scene', () => {
    let data = go(initialState(), 'elders', 'frost_gate', 'frost_accept', 'jam_gate', 'berry_gift', 'kiln_gate', 'kiln_blessed', 'grand_bake');
    data = applyChoice(data, availableChoices(nodeAt(data), data).findIndex((c) => c.label.includes('Cakey the Brave')));
    expect(data.outcome).toBe('win');
    expect(interpolate(NODES.win_end.text, data)).toContain('Cakey the Brave');
  });

  it('loses to the greedy answer', () => {
    const data = go(initialState(), 'frost_gate', 'frost_greedy');
    expect(data.outcome).toBe('lose');
  });

  it('marks a sneak as cursed and the blessing rescues at the kiln', () => {
    let data = go(initialState(), 'elders', 'frost_gate', 'frost_sneak', 'jam_gate', 'berry_fox', 'kiln_gate');
    expect(data.flags.cursed).toBe(true);
    const kilnChoices = availableChoices(nodeAt(data), data).map((c) => c.to);
    expect(kilnChoices).toContain('kiln_blessed');
    expect(kilnChoices).toContain('kiln_mercy');
    expect(kilnChoices).toContain('kiln_bluff');
    expect(kilnChoices).not.toContain('kiln_judge');
    data = applyChoice(data, pick(data, 'kiln_blessed'));
    expect(data.flags.cursed).toBe(true);
    expect(data.inventory).toContain('yeast_spark');
    data = applyChoice(data, pick(data, 'grand_bake'));
    data = applyChoice(data, pick(data, 'win_end'));
    expect(data.outcome).toBe('win');
  });

  it('confessing the theft earns the spark and clears the curse', () => {
    let data = go(initialState(), 'frost_gate', 'frost_sneak', 'jam_gate', 'berry_fox', 'kiln_gate');
    data = applyChoice(data, pick(data, 'kiln_mercy'));
    expect(data.flags.cursed).toBe(false);
    expect(data.inventory).toContain('yeast_spark');
  });

  it('bluffing the fire loses the game', () => {
    const data = go(initialState(), 'frost_gate', 'frost_sneak', 'jam_gate', 'berry_fox', 'kiln_gate', 'kiln_bluff');
    expect(data.outcome).toBe('lose');
  });

  it('the stolen berry haunts the kiln into a single doomed choice', () => {
    let data = go(initialState(), 'frost_gate', 'frost_accept', 'jam_gate', 'berry_steal');
    expect(data.flags.haunted).toBe(true);
    data = applyChoice(data, pick(data, 'kiln_gate'));
    const kilnChoices = availableChoices(nodeAt(data), data).map((c) => c.to);
    expect(kilnChoices).toEqual(['kiln_judge']);
    data = applyChoice(data, 0);
    expect(data.outcome).toBe('lose');
  });

  it('hides the blessing gift when the player skipped the elder crumbs', () => {
    const data = go(initialState(), 'frost_gate', 'frost_accept', 'jam_gate');
    const tos = availableChoices(nodeAt(data), data).map((c) => c.to);
    expect(tos).not.toContain('berry_gift');
    expect(tos).toContain('berry_fox');
  });
});

describe('game controller over HTTP', () => {
  let port: number;
  let baseUrl: string;
  let handle: ReturnType<typeof createPlatform>;

  beforeAll(async () => {
    port = await new Promise<number>((resolve, reject) => {
      const srv = createHttpServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const root = mkdtempSync(path.join(tmpdir(), 'game-test-'));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: path.join(root, 'downloads'),
    });
    await new Promise<void>((resolve) => {
      const server = createHttpServer(handle.app);
      server.listen(port, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.store.flush();
  });

  async function actLabel(id: string, label: string) {
    const view = await (await fetch(`${baseUrl}/game/${id}`)).json();
    const choice = view.game.choices.find((c: { label: string }) => c.label === label);
    expect(choice, `choice '${label}' should exist`).toBeTruthy();
    const res = await fetch(`${baseUrl}/game/${id}/act`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ choice: choice.index }),
    });
    return (await res.json()).game;
  }

  it('creates a game session, lists it, and plays the full win path', async () => {
    const created = await (await fetch(`${baseUrl}/game/new`, { method: 'POST' })).json();
    const id = created.game.id;
    expect(created.game.nodeId).toBe('start');
    expect(created.game.status).toBe('active');

    const list = await (await fetch(`${baseUrl}/game`)).json();
    expect(list.games.some((g: { id: string }) => g.id === id)).toBe(true);

    let g = await actLabel(id, 'Ask the Elder Crumbs for a blessing');
    g = await actLabel(id, 'Thank them and head for the Frost Fields');
    g = await actLabel(id, 'Say: "A warm friend."');
    g = await actLabel(id, 'Cross into the Jam Woods');
    g = await actLabel(id, 'Offer the Whispering Berry your Crumb blessing');
    g = await actLabel(id, 'Climb to the Kiln Caves');
    g = await actLabel(id, 'Hold up the Crumb blessing');
    g = await actLabel(id, 'Begin the Grand Bake');
    g = await actLabel(id, 'Name yourself simply... Cak');

    expect(g.outcome).toBe('win');
    expect(g.status).toBe('done');
    expect(g.inventory.map((i: { id: string }) => i.id)).toEqual([
      'crumb_blessing',
      'sugar_dust',
      'whispering_berry',
      'yeast_spark',
    ]);
    expect(g.checkpoints).toBeGreaterThan(1);

    const session = await (await fetch(`${baseUrl}/api/sessions/${id}`)).json();
    expect(session.session.status).toBe('done');
    expect(session.session.metadata.app).toBe('game');
  });

  it('recovers from a pause: acting on a paused game resumes it', async () => {
    const created = await (await fetch(`${baseUrl}/game/new`, { method: 'POST' })).json();
    const id = created.game.id;
    const paused = await (await fetch(`${baseUrl}/game/${id}/pause`, { method: 'POST' })).json();
    expect(paused.game.status).toBe('paused');

    const acted = await actLabel(id, 'Ask the Elder Crumbs for a blessing');
    expect(acted.nodeId).toBe('elders');
    expect(acted.status).toBe('active');
  });

  it('abandoning a run cancels its session', async () => {
    const created = await (await fetch(`${baseUrl}/game/new`, { method: 'POST' })).json();
    const id = created.game.id;
    const abandoned = await (await fetch(`${baseUrl}/game/${id}/abandon`, { method: 'POST' })).json();
    expect(abandoned.game.status).toBe('cancelled');
  });
});

describe('game sessions skip the watchdog', () => {
  it('stalls ordinary sessions but never a game', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-watchdog-'));
    const store = new JsonFileStore(path.join(root, 'data'));
    const service = new SessionService(store, 60_000);

    const gameSession = (await service.create({ metadata: { app: 'game' } })).session;
    await service.queue(gameSession.id);
    await service.start(gameSession.id);
    await service.heartbeat(gameSession.id, {});
    const taskSession = (await service.create({ metadata: { app: 'task' } })).session;
    await service.queue(taskSession.id);
    await service.start(taskSession.id);
    await service.heartbeat(taskSession.id, {});

    const stale = new Date(Date.now() - 120_000).toISOString();
    for (const id of [gameSession.id, taskSession.id]) {
      const session = (await store.get(id))!;
      session.lastHeartbeatAt = stale;
      await store.put(session);
    }

    const stalled = await service.runWatchdog({ timeoutMs: 1_000 });
    const ids = stalled.map((s) => s.id);
    expect(ids).toContain(taskSession.id);
    expect(ids).not.toContain(gameSession.id);
  });
});

describe('market game — played on the market', () => {
  it('builds a seeded play pool from the simulator', async () => {
    const { plays, markets } = await buildPlays({ mode: 'sim', seed: 7 });
    expect(markets).toBeGreaterThan(0);
    expect(plays.length).toBeGreaterThan(0);
    for (const play of plays) {
      expect(play.bestReturn).toBeGreaterThan(0);
      expect(play.yesPrice).toBeGreaterThan(0);
      expect(play.noPrice).toBeGreaterThan(0);
      expect(play.yesPrice + play.noPrice).toBeLessThan(1);
    }
  });

  it('arbitrage locks a guaranteed profit', () => {
    const state = initialMarketGame(
      [{ id: 'm', question: 'Q', yesPrice: 0.55, noPrice: 0.4, bestReturn: 0.05, type: 'within-market' }],
      { mode: 'sim', seed: 1, source: 'simulator' },
    );
    const next = resolveMarketPlay(state, 0);
    expect(next.purse).toBeCloseTo(100 * 1.05, 5);
    expect(next.arbs).toBe(1);
    expect(next.decisions).toBe(1);
    expect(next.history[0].action).toBe('Arbitrage');
  });

  it('buying a single side resolves with a win or a loss', () => {
    const state = initialMarketGame(
      [{ id: 'm', question: 'Q', yesPrice: 0.55, noPrice: 0.4, bestReturn: 0.05, type: 'within-market' }],
      { mode: 'sim', seed: 1, source: 'simulator' },
    );
    const next = resolveMarketPlay(state, 1);
    expect(next.gambles).toBe(1);
    expect(next.history.length).toBe(1);
    const { stake, result } = next.history[0];
    expect(stake).toBeCloseTo(25, 5);
    if (result > 0) {
      expect(next.wins).toBe(1);
      expect(result).toBeCloseTo(20.45, 5);
    } else {
      expect(next.losses).toBe(1);
      expect(result).toBeCloseTo(-25, 5);
    }
    expect(next.purse).toBeCloseTo(100 + result, 5);
  });

  it('passing keeps the purse unchanged', () => {
    const state = initialMarketGame(
      [{ id: 'm', question: 'Q', yesPrice: 0.55, noPrice: 0.4, bestReturn: 0.05, type: 'within-market' }],
      { mode: 'sim', seed: 1, source: 'simulator' },
    );
    const next = resolveMarketPlay(state, 3);
    expect(next.purse).toBe(100);
    expect(next.passes).toBe(1);
    expect(next.history[0].result).toBe(0);
  });

  it('arbitraging every window reaches the Grand Bake and a win', () => {
    let state = initialMarketGame(
      [
        { id: 'a', question: 'A', yesPrice: 0.55, noPrice: 0.4, bestReturn: 0.05, type: 'within-market' },
        { id: 'b', question: 'B', yesPrice: 0.5, noPrice: 0.45, bestReturn: 0.05, type: 'cross-market' },
        { id: 'c', question: 'C', yesPrice: 0.5, noPrice: 0.45, bestReturn: 0.05, type: 'within-market' },
        { id: 'd', question: 'D', yesPrice: 0.5, noPrice: 0.45, bestReturn: 0.05, type: 'cross-market' },
      ],
      { mode: 'sim', seed: 1, source: 'simulator' },
    );
    while (!isBakePhase(state) && state.outcome === null && state.round < state.plays.length) {
      state = resolveMarketPlay(state, 0);
    }
    expect(isBakePhase(state)).toBe(true);
    expect(state.purse).toBeGreaterThan(state.startPurse * 1.15);
    state = resolveMarketPlay(state, 1);
    expect(state.outcome).toBe('win');
    expect(state.ending).toBe('grand');
    expect(state.name).toBe('Sir Frostbite');
  });

  it('a losing streak can break the purse', () => {
    const plays = [
      { id: 'm', question: 'Q', yesPrice: 0.99, noPrice: 0.01, bestReturn: 0.001, type: 'within-market' as const },
    ];
    let broke = false;
    for (let seed = 0; seed < 2000 && !broke; seed += 1) {
      const many: typeof plays = [];
      for (let i = 0; i < 6; i += 1) many.push({ ...plays[0], id: 'm' + i });
      let state = initialMarketGame(many, { mode: 'sim', seed, source: 'simulator' });
      for (let i = 0; i < 6 && state.outcome === null; i += 1) {
        state = resolveMarketPlay(state, 2);
      }
      if (state.outcome === 'lose' && state.ending === 'broke') broke = true;
    }
    expect(broke).toBe(true);
  });
});

describe('market game over HTTP', () => {
  let port: number;
  let baseUrl: string;
  let dataServer: Server;
  let handle: ReturnType<typeof createPlatform>;

  const SNAPSHOT = [
    {
      id: 'm1',
      question: 'Will event X happen?',
      outcomes: [
        { name: 'Yes', price: 0.55 },
        { name: 'No', price: 0.4 },
      ],
    },
    {
      id: 'm2',
      eventId: 'e2',
      question: 'Will Y happen? (A)',
      outcomes: [
        { name: 'Yes', price: 0.62 },
        { name: 'No', price: 0.41 },
      ],
    },
    {
      id: 'm3',
      eventId: 'e2',
      question: 'Will Y happen?',
      outcomes: [
        { name: 'Yes', price: 0.42 },
        { name: 'No', price: 0.52 },
      ],
    },
  ];

  beforeAll(async () => {
    port = await new Promise<number>((resolve, reject) => {
      const srv = createHttpServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const root = mkdtempSync(path.join(tmpdir(), 'game-mkt-'));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: path.join(root, 'downloads'),
    });
    await new Promise<void>((resolve) => {
      const server = createHttpServer(handle.app);
      server.listen(port, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${port}`;

    const payload = Buffer.from(JSON.stringify(SNAPSHOT));
    dataServer = createHttpServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const start = Number(/^bytes=(\d+)-/.exec(range)?.[1] ?? 0);
        res.writeHead(206, {
          'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
          'content-length': payload.length - start,
          'accept-ranges': 'bytes',
        });
        res.end(payload.subarray(start));
      } else {
        res.writeHead(200, { 'content-length': payload.length });
        res.end(payload);
      }
    });
    await new Promise<void>((resolve) => dataServer.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await handle.store.flush();
    dataServer.close();
  });

  it('creates a sim market game with four decisions per round', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'market', seed: 3 }),
      })
    ).json();
    const game = created.game;
    expect(game.kind).toBe('market');
    expect(game.market.rounds).toBeGreaterThan(0);
    expect(game.choices.length).toBe(4);
    expect(game.market.purse).toBe(100);
    expect(game.choices[0].label).toMatch(/Arbitrage/);
  });

  it('creates a file market game from a downloaded snapshot', async () => {
    const sourceUrl = `http://127.0.0.1:${(dataServer.address() as { port: number }).port}/markets.json`;
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'market', sourceUrl, filename: 'markets.json', seed: 1 }),
      })
    ).json();
    expect(created.game.kind).toBe('market');
    expect(created.game.market.mode).toBe('file');
    expect(created.game.market.rounds).toBeGreaterThanOrEqual(1);
    expect(created.game.market.source).toBe('markets.json');
  });

  it('plays a full market game to a won Grand Bake over HTTP', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'market', seed: 11 }),
      })
    ).json();
    const id = created.game.id;
    let game = created.game;
    let rounds = 0;
    while (game.kind === 'market' && !game.outcome && game.market.phase === 'play' && rounds < 30) {
      const acted = await (
        await fetch(`${baseUrl}/game/${id}/act`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ choice: 0 }),
        })
      ).json();
      game = acted.game;
      rounds += 1;
    }
    expect(game.market.phase).toBe('bake');
    const named = await (
      await fetch(`${baseUrl}/game/${id}/act`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice: 0 }),
      })
    ).json();
    expect(named.game.outcome).toBe('win');
    expect(named.game.status).toBe('done');
    expect(named.game.market.ending).toBe('grand');
  });
});

describe('crypto game — invested on the live market', () => {
  it('buys a stake and holds the coin', async () => {
    const state = await initialCryptoGame({ seed: 1, live: false });
    expect(state.kind).toBe('crypto');
    expect(state.coin).not.toBeNull();
    expect(state.source).toBe('sim');
    const before = state.purse;
    const next = await resolveCryptoPlay(state, 0);
    expect(next.holding).not.toBeNull();
    expect(next.holding?.symbol).toBe(state.coin?.symbol);
    expect(next.purse).toBeCloseTo(before - before * 0.5, 5);
    expect(next.buys).toBe(1);
    expect(next.history[0]?.action).toContain('Buy');
  });

  it('rejects a second buy while holding', async () => {
    const state = await initialCryptoGame({ seed: 1, live: false });
    const after = await resolveCryptoPlay(state, 0);
    await expect(resolveCryptoPlay(after, 0)).rejects.toThrow(/already holding/);
  });

  it('passing keeps the purse unchanged', async () => {
    const state = await initialCryptoGame({ seed: 3, live: false });
    const next = await resolveCryptoPlay(state, 2);
    expect(next.purse).toBe(state.purse);
    expect(next.passes).toBe(1);
  });

  it('a sell into a rising market realises a profit', async () => {
    const state = await initialCryptoGame({ seed: 269, live: false });
    let s = await resolveCryptoPlay(state, 0);
    expect(s.holding?.symbol).toBe('BTC');
    const entry = s.holding!.entryPrice;
    s = await resolveCryptoPlay(s, 2);
    s = await resolveCryptoPlay(s, 2);
    s = await resolveCryptoPlay(s, 2);
    s = await resolveCryptoPlay(s, 2);
    s = await resolveCryptoPlay(s, 2);
    const market = cryptoPriceOf(s, 'BTC');
    expect(market).toBeGreaterThan(entry);
    const purseBefore = s.purse;
    const sold = await resolveCryptoPlay(s, 1);
    expect(sold.holding).toBeNull();
    expect(sold.purse).toBeGreaterThan(purseBefore);
    expect(sold.wins).toBe(1);
    expect(sold.history[6]?.action).toBe('Sell BTC');
  });

  it('riding a winner to the Grand Bake', async () => {
    const state = await initialCryptoGame({ seed: 269, live: false });
    let s = state;
    const sequence = [0, 2, 2, 2, 2, 2, 1, 0, 1, 0];
    for (const choice of sequence) {
      s = await resolveCryptoPlay(s, choice);
    }
    expect(isCryptoBake(s)).toBe(true);
    expect(s.purse).toBeGreaterThanOrEqual(s.startPurse * 1.15);
    s = await resolveCryptoPlay(s, 0);
    expect(s.outcome).toBe('win');
    expect(s.ending).toBe('grand');
    expect(s.name).toBe('Cakey the Brave');
  });

  it('falls back to anchor prices when the live feed is unreachable', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    try {
      const state = await initialCryptoGame({ seed: 1, live: true });
      expect(state.source).toBe('live');
      expect(state.coin).not.toBeNull();
      const next = await resolveCryptoPlay(state, 2);
      expect(next.round).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('millionaire trivia game — the hot seat', () => {
  it('builds a deterministic deck of fifteen questions, one per tier', () => {
    const a = initialMillionGame({ seed: 42 });
    const b = initialMillionGame({ seed: 42 });
    expect(a.rounds).toBe(MILLION_ROUNDS);
    expect(a.questions).toHaveLength(MILLION_ROUNDS);
    expect(a.questions.map((q) => q.prompt)).toEqual(b.questions.map((q) => q.prompt));
    for (let i = 0; i < a.questions.length; i += 1) {
      const q = a.questions[i]!;
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(new Set(q.options).size).toBe(4);
    }
    const c = initialMillionGame({ seed: 43 });
    expect(c.questions.map((q) => q.prompt)).not.toEqual(a.questions.map((q) => q.prompt));
  });

  it('a correct answer banks the tier and moves to the next question', () => {
    const state = initialMillionGame({ seed: 7 });
    const answer = state.questions[0]!.answer;
    const next = resolveMillionPlay(state, answer);
    expect(next.bank).toBe(MILLION_TIERS[0]);
    expect(next.round).toBe(1);
    expect(next.corrects).toBe(1);
    expect(next.history[0]!.action).toBe('Correct');
  });

  it('a wrong answer before the first safe haven ends the game broke', () => {
    const state = initialMillionGame({ seed: 7 });
    const wrong = state.questions[0]!.answer === 0 ? 1 : 0;
    const next = resolveMillionPlay(state, wrong);
    expect(next.outcome).toBe('lose');
    expect(next.ending).toBe('broke');
    expect(next.won).toBe(0);
    expect(next.bank).toBe(0);
  });

  it('a wrong answer past question five falls to the thousand-dollar floor', () => {
    let state = initialMillionGame({ seed: 11 });
    for (let r = 0; r < 5; r += 1) {
      state = resolveMillionPlay(state, state.questions[r]!.answer);
    }
    expect(state.bank).toBe(MILLION_TIERS[4]);
    const wrong = state.questions[5]!.answer === 0 ? 1 : 0;
    const next = resolveMillionPlay(state, wrong);
    expect(next.outcome).toBe('lose');
    expect(next.ending).toBe('fall');
    expect(next.won).toBe(MILLION_TIERS[4]);
  });

  it('50/50 removes two wrong answers and can only be used once', () => {
    const state = initialMillionGame({ seed: 3 });
    const answerText = state.questions[0]!.options[state.questions[0]!.answer]!;
    const after = resolveMillionPlay(state, MILLION_FIFTY);
    expect(after.lives.fifty).toBe(true);
    expect(after.questions[0]!.options).toHaveLength(2);
    expect(after.questions[0]!.options).toContain(answerText);
    expect(after.decisions).toBe(1);
    expect(after.round).toBe(0);
    expect(() => resolveMillionPlay(after, MILLION_FIFTY)).toThrow(/already been used/);
  });

  it('phone and audience each provide one hint, once', () => {
    const state = initialMillionGame({ seed: 5 });
    const phoned = resolveMillionPlay(state, 5);
    expect(phoned.lives.phone).toBe(true);
    expect(phoned.hint?.kind).toBe('phone');
    expect(() => resolveMillionPlay(phoned, 5)).toThrow(/already on the line/);
    const audience = resolveMillionPlay(phoned, 6);
    expect(audience.lives.audience).toBe(true);
    expect(audience.hint?.kind).toBe('audience');
    expect(audience.hint?.text).toContain('%');
    expect(() => resolveMillionPlay(audience, 6)).toThrow(/already voted/);
  });

  it('walking away banks the secured cash and ends the run', () => {
    let state = initialMillionGame({ seed: 9 });
    state = resolveMillionPlay(state, state.questions[0]!.answer);
    state = resolveMillionPlay(state, state.questions[1]!.answer);
    const bank = state.bank;
    const walked = resolveMillionPlay(state, MILLION_WALK);
    expect(walked.outcome).toBe('lose');
    expect(walked.ending).toBe('walk');
    expect(walked.won).toBe(bank);
    expect(walked.walks).toBe(1);
  });

  it('answering every question right reaches the Grand Bake and a win', () => {
    let state = initialMillionGame({ seed: 42 });
    for (let r = 0; r < MILLION_ROUNDS; r += 1) {
      state = resolveMillionPlay(state, state.questions[r]!.answer);
    }
    expect(isMillionBake(state)).toBe(true);
    expect(state.bank).toBe(MILLION_TIERS[14]);
    state = resolveMillionPlay(state, 0);
    expect(state.outcome).toBe('win');
    expect(state.ending).toBe('grand');
    expect(state.won).toBe(MILLION_TIERS[14]);
    expect(state.name).toBe('Cakey the Brave');
  });
});

describe('millionaire trivia game over HTTP', () => {
  let baseUrl: string;
  let handle: ReturnType<typeof createPlatform>;
  let server: Server;

  beforeAll(async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const srv = createHttpServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const root = mkdtempSync(path.join(tmpdir(), 'game-million-'));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: path.join(root, 'downloads'),
    });
    server = createHttpServer(handle.app);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.store.flush();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a trivia game with answers, lifelines and a walk-away choice', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'million', seed: 3 }),
      })
    ).json();
    const game = created.game;
    expect(game.kind).toBe('million');
    expect(game.million.phase).toBe('play');
    expect(game.million.rounds).toBe(MILLION_ROUNDS);
    expect(game.million.bank).toBe(0);
    expect(game.choices.length).toBe(8);
    expect(game.choices[0].label).toBeTruthy();
    expect(game.choices.map((c: { label: string }) => c.label)).toContain('50/50 — remove two wrong answers');
    expect(game.choices.map((c: { label: string }) => c.label)).toContain('Phone a friend');
    expect(game.choices.map((c: { label: string }) => c.label)).toContain('Ask the audience');
    expect(game.choices.map((c: { label: string }) => c.label).some((l: string) => /Walk away with/.test(l))).toBe(true);
    const listed = await (await fetch(`${baseUrl}/game`)).json();
    expect(listed.games.some((g: { id: string; kind: string }) => g.id === game.id && g.kind === 'million')).toBe(true);
  });

  it('a wrong answer over HTTP ends the run broke', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'million', seed: 4 }),
      })
    ).json();
    const id = created.game.id;
    const wrong = created.game.million.question.options;
    const deck = initialMillionGame({ seed: 4 });
    const answer = deck.questions[0]!.answer;
    const wrongIndex = answer === 0 ? 1 : 0;
    const acted = await (
      await fetch(`${baseUrl}/game/${id}/act`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice: wrongIndex }),
      })
    ).json();
    expect(acted.game.outcome).toBe('lose');
    expect(acted.game.million.ending).toBe('broke');
    expect(wrong.length).toBe(4);
  });

  it('plays a full trivia game to the million over HTTP', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'million', seed: 42 }),
      })
    ).json();
    const id = created.game.id;
    const deck = initialMillionGame({ seed: 42 });
    let game = created.game;
    for (let r = 0; r < MILLION_ROUNDS; r += 1) {
      const acted = await (
        await fetch(`${baseUrl}/game/${id}/act`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ choice: deck.questions[r]!.answer }),
        })
      ).json();
      game = acted.game;
    }
    expect(game.million.phase).toBe('bake');
    expect(game.million.bank).toBe(MILLION_TIERS[14]);
    const named = await (
      await fetch(`${baseUrl}/game/${id}/act`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice: 1 }),
      })
    ).json();
    expect(named.game.outcome).toBe('win');
    expect(named.game.status).toBe('done');
    expect(named.game.million.ending).toBe('grand');
    expect(named.game.million.name).toBe('Sir Frostbite');
    expect(named.game.million.won).toBe(MILLION_TIERS[14]);
  });
});

describe('crypto game over HTTP', () => {
  let baseUrl: string;
  let handle: ReturnType<typeof createPlatform>;
  let server: Server;

  beforeAll(async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const srv = createHttpServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const root = mkdtempSync(path.join(tmpdir(), 'game-crypto-'));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: path.join(root, 'downloads'),
    });
    server = createHttpServer(handle.app);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.store.flush();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a sim crypto game with buy, sell and pass choices', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'crypto', seed: 1 }),
      })
    ).json();
    const game = created.game;
    expect(game.kind).toBe('crypto');
    expect(game.crypto.phase).toBe('play');
    expect(game.crypto.rounds).toBe(10);
    expect(game.choices.map((c: { label: string }) => c.label)).toContain('Pass this window');
    expect(game.choices.some((c: { label: string }) => c.label.startsWith('Buy '))).toBe(true);
    const listed = await (await fetch(`${baseUrl}/game`)).json();
    expect(listed.games.some((g: { id: string; kind: string }) => g.id === game.id && g.kind === 'crypto')).toBe(true);
  });

  it('plays a full crypto game to a won Grand Bake over HTTP', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'crypto', seed: 269 }),
      })
    ).json();
    const id = created.game.id;
    let game = created.game;
    const sequence = [0, 2, 2, 2, 2, 2, 1, 0, 1, 0];
    for (const choice of sequence) {
      const acted = await (
        await fetch(`${baseUrl}/game/${id}/act`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ choice }),
        })
      ).json();
      game = acted.game;
    }
    expect(game.crypto.phase).toBe('bake');
    const named = await (
      await fetch(`${baseUrl}/game/${id}/act`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice: 1 }),
      })
    ).json();
    expect(named.game.outcome).toBe('win');
    expect(named.game.status).toBe('done');
    expect(named.game.crypto.ending).toBe('grand');
    expect(named.game.crypto.name).toBe('Sir Frostbite');
  });
});

async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('condition not met within ' + timeoutMs + 'ms');
}

const TRADE_SNAPSHOT = [
  { id: 'm1', question: 'Will event X happen?', outcomes: [{ name: 'Yes', price: 0.55 }, { name: 'No', price: 0.4 }] },
  { id: 'm2', question: 'Will event Y happen?', outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.41 }] },
];

describe('market snapshot integration — play the agent\'s real data', () => {
  it('builds plays straight from a local agent snapshot', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-snap-'));
    const dir = path.join(root, 'downloads');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'market-snapshot.json'), JSON.stringify(TRADE_SNAPSHOT));
    const { plays, markets } = await buildPlaysFromSnapshot('market-snapshot.json', dir);
    expect(markets).toBe(2);
    expect(plays.length).toBeGreaterThan(0);
    for (const play of plays) expect(play.bestReturn).toBeGreaterThan(0);
  });

  it('throws when the snapshot is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-snap-'));
    await expect(buildPlaysFromSnapshot('market-snapshot.json', path.join(root, 'none'))).rejects.toThrow(/no markets/);
  });
});

describe('autopilot bot — the money modes play themselves', () => {
  it('runs market, crypto and million, banking each run into a persisted ledger', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-bot-'));
    const dataFile = path.join(root, 'bot-ledger.json');
    const bot = new BotRunner({ dataFile, moveMs: 1, gapMs: 1 });
    bot.load();
    bot.start();
    await waitFor(() => bot.status().runs >= 3);
    bot.stop();
    const status = bot.status();
    expect(status.runs).toBeGreaterThanOrEqual(3);
    const kinds = status.recent.map((r) => r.kind);
    expect(kinds).toContain('market');
    expect(kinds).toContain('crypto');
    expect(kinds).toContain('million');
    for (const run of status.recent.filter((r) => r.kind === 'market')) {
      expect(run.outcome).toBe('win');
      expect(run.net).toBeGreaterThan(0);
    }
    const loaded = new BotRunner({ dataFile, moveMs: 1, gapMs: 1 });
    loaded.load();
    expect(loaded.status().runs).toBe(status.runs);
    expect(loaded.status().bankroll).toBeCloseTo(status.bankroll, 2);
  });

  it('trades the latest agent snapshot when it is present', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-bot-'));
    const downloads = path.join(root, 'downloads');
    mkdirSync(downloads, { recursive: true });
    writeFileSync(path.join(downloads, 'market-snapshot.json'), JSON.stringify(TRADE_SNAPSHOT));
    const bot = new BotRunner({
      dataFile: path.join(root, 'bot-ledger.json'),
      downloadDir: downloads,
      moveMs: 1,
      gapMs: 1,
    });
    bot.start();
    await waitFor(() => bot.status().runs >= 1);
    bot.stop();
    const market = bot.status().recent.find((r) => r.kind === 'market');
    expect(market).toBeDefined();
    expect(market!.feed).toBe('market-snapshot.json');
    expect(market!.outcome).not.toBeNull();
    expect(market!.endedAt).not.toBeNull();
  });

  it('stops the loop and holds the ledger', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-bot-'));
    const bot = new BotRunner({ dataFile: path.join(root, 'bot-ledger.json'), moveMs: 1, gapMs: 1 });
    bot.start();
    await waitFor(() => bot.status().runs >= 1);
    bot.stop();
    const count = bot.status().runs;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(bot.status().runs).toBe(count);
    expect(bot.status().active).toBe(false);
  });
}, 20000);

describe('trading integration over HTTP — the autopilot trades the agent snapshot', () => {
  let port: number;
  let baseUrl: string;
  let server: Server;
  let handle: ReturnType<typeof createPlatform>;

  beforeAll(async () => {
    port = await new Promise<number>((resolve, reject) => {
      const srv = createHttpServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
    const root = mkdtempSync(path.join(tmpdir(), 'game-trade-'));
    const downloads = path.join(root, 'downloads');
    mkdirSync(downloads, { recursive: true });
    writeFileSync(path.join(downloads, 'market-snapshot.json'), JSON.stringify(TRADE_SNAPSHOT));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: downloads,
    });
    server = createHttpServer(handle.app);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    handle.bot.stop();
    await handle.store.flush();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a market game from the latest agent snapshot with latest:true', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'market', latest: true }),
      })
    ).json();
    expect(created.game.kind).toBe('market');
    expect(created.game.market.mode).toBe('file');
    expect(created.game.market.source).toBe('market-snapshot.json');
    expect(created.game.market.rounds).toBeGreaterThanOrEqual(1);
  });

  it('rejects a latest game when no snapshot has been downloaded', async () => {
    const created = await (
      await fetch(`${baseUrl}/game/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'market', latest: true, filename: 'absent.json' }),
      })
    ).json();
    expect(created.error).toMatch(/no markets in snapshot absent.json/);
  });

  it('starts the autopilot, trades the snapshot, and stops it', async () => {
    const idle = await (await fetch(`${baseUrl}/bot`)).json();
    expect(idle.status.active).toBe(false);

    const started = await (await fetch(`${baseUrl}/bot/start`, { method: 'POST' })).json();
    expect(started.status.active).toBe(true);

    await waitFor(async () => {
      const d = await (await fetch(`${baseUrl}/bot`)).json();
      return d.status.runs >= 1;
    });

    const running = await (await fetch(`${baseUrl}/bot`)).json();
    expect(running.status.runs).toBeGreaterThanOrEqual(1);
    const market = running.status.recent.find((r: { kind: string }) => r.kind === 'market');
    expect(market).toBeDefined();
    expect(market.feed).toBe('market-snapshot.json');

    const stopped = await (await fetch(`${baseUrl}/bot/stop`, { method: 'POST' })).json();
    expect(stopped.status.active).toBe(false);
  });
}, 30000);
