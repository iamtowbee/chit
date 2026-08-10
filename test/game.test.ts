import { mkdtempSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlatform } from '../src/platform.js';
import { SessionService } from '../src/service.js';
import { JsonFileStore } from '../src/store.js';
import {
  applyChoice,
  availableChoices,
  initialState,
  interpolate,
  isTerminal,
  nodeAt,
  progress,
} from '../src/game/engine.js';
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
