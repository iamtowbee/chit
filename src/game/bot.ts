import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPlays,
  buildPlaysFromSnapshot,
  initialMarketGame,
  isBakePhase as isMarketBake,
  resolveMarketPlay,
  type MarketGameData,
  type MarketHistoryEntry,
  type MarketPlay,
} from './market.js';
import {
  cryptoPriceOf,
  initialCryptoGame,
  isCryptoBake,
  resolveCryptoPlay,
  type CryptoGameData,
  type CryptoHistoryEntry,
} from './crypto.js';
import {
  MILLION_AUDIENCE,
  MILLION_FIFTY,
  MILLION_PHONE,
  MILLION_WALK,
  initialMillionGame,
  isMillionBake,
  resolveMillionPlay,
  type MillionGameData,
  type MillionHistoryEntry,
} from './million.js';

export type BotMode = 'market' | 'crypto' | 'million';

export interface BotRunView {
  id: string;
  kind: BotMode;
  seed: number;
  feed: string;
  startedAt: string;
  endedAt: string | null;
  outcome: 'win' | 'lose' | null;
  ending: string | null;
  result: number;
  net: number;
  moves: number;
  steps: string[];
  name: string | null;
}

export interface BotCurrentView {
  id: string;
  kind: BotMode;
  seed: number;
  feed: string;
  round: number;
  rounds: number;
  result: number;
  lastStep: string | null;
}

export interface BotStatus {
  active: boolean;
  bankroll: number;
  wins: number;
  losses: number;
  runs: number;
  current: BotCurrentView | null;
  recent: BotRunView[];
}

type BotState = MarketGameData | CryptoGameData | MillionGameData;

interface Running {
  run: BotRunView;
  state: BotState;
  rng: () => number;
}

const MODE_ORDER: BotMode[] = ['market', 'crypto', 'million'];
const MAX_KEPT_RUNS = 200;

export interface BotOptions {
  dataFile: string;
  /** if set, the bot's market runs trade the latest agent snapshot in this directory when present */
  downloadDir?: string;
  moveMs?: number;
  gapMs?: number;
}

/**
 * The autopilot. Plays the money modes by itself — market arbitrage, crypto
 * swing trades, and the millionaire hot seat — on a timer, banking each run
 * into a persisted ledger. The player watches it earn.
 */
export class BotRunner {
  private readonly moveMs: number;
  private readonly gapMs: number;
  private active = false;
  private loopPromise: Promise<void> | null = null;
  private runs: BotRunView[] = [];
  private bankroll = 0;
  private wins = 0;
  private losses = 0;
  private seed = 1;
  private modeIdx = 0;
  private current: Running | null = null;

  constructor(private readonly options: BotOptions) {
    this.moveMs = options.moveMs ?? 140;
    this.gapMs = options.gapMs ?? 600;
  }

  load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.options.dataFile, 'utf8')) as {
        runs?: BotRunView[];
      };
      const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
      this.runs = runs.slice(-MAX_KEPT_RUNS);
      let bankroll = 0;
      let wins = 0;
      let losses = 0;
      for (const run of this.runs) {
        bankroll = round2(bankroll + run.net);
        if (run.outcome === 'win') wins += 1;
        else if (run.outcome === 'lose') losses += 1;
      }
      this.bankroll = bankroll;
      this.wins = wins;
      this.losses = losses;
    } catch {
      this.runs = [];
      this.bankroll = 0;
      this.wins = 0;
      this.losses = 0;
    }
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.loopPromise = this.loop();
  }

  stop(): void {
    this.active = false;
  }

  status(): BotStatus {
    return {
      active: this.active,
      bankroll: this.bankroll,
      wins: this.wins,
      losses: this.losses,
      runs: this.runs.length,
      current: this.current ? currentView(this.current) : null,
      recent: this.runs.slice(-12).reverse(),
    };
  }

  private async loop(): Promise<void> {
    while (this.active) {
      try {
        if (this.current) {
          const done = await this.stepOnce();
          if (done) {
            this.finishRun();
            await this.sleep(this.gapMs);
          } else {
            await this.sleep(this.moveMs);
          }
        } else {
          await this.startNextRun();
          await this.sleep(this.moveMs);
        }
      } catch (err) {
        if (this.current) {
          this.current.run.ending = 'error';
          this.current.run.endedAt = new Date().toISOString();
          this.current.run.steps.push('failed: ' + (err instanceof Error ? err.message : String(err)));
          this.finishRun();
        }
        await this.sleep(this.gapMs);
      }
    }
  }

  private async startNextRun(): Promise<void> {
    const kind = MODE_ORDER[this.modeIdx] as BotMode;
    const seed = this.seed;
    let state: BotState;
    let feed: string;
    if (kind === 'market') {
      const built = await this.buildMarketPlays(seed);
      state = initialMarketGame(built.plays, { mode: built.feed === 'simulator' ? 'sim' : 'file', seed, source: built.feed });
      feed = built.feed;
    } else if (kind === 'crypto') {
      state = await initialCryptoGame({ seed, live: false });
      feed = 'simulator';
    } else {
      state = initialMillionGame({ seed });
      feed = 'simulator';
    }
    const run: BotRunView = {
      id: randomUUID(),
      kind,
      seed,
      feed,
      startedAt: new Date().toISOString(),
      endedAt: null,
      outcome: null,
      ending: null,
      result: 0,
      net: 0,
      moves: 0,
      steps: [],
      name: null,
    };
    this.current = { run, state, rng: mulberry32((seed ^ 0x5bd1e995) >>> 0) };
  }

  private async buildMarketPlays(seed: number): Promise<{ plays: MarketPlay[]; feed: string }> {
    const downloadDir = this.options.downloadDir;
    const snapshotPath = downloadDir ? path.join(downloadDir, 'market-snapshot.json') : null;
    if (snapshotPath && existsSync(snapshotPath)) {
      try {
        const built = await buildPlaysFromSnapshot('market-snapshot.json', downloadDir as string);
        if (built.plays.length > 0) return { plays: built.plays, feed: 'market-snapshot.json' };
      } catch {
        // fall through to the simulator
      }
    }
    const built = await buildPlays({ mode: 'sim', seed });
    if (built.plays.length === 0) {
      throw new Error('no tradable windows for seed ' + seed);
    }
    return { plays: built.plays, feed: 'simulator' };
  }

  private async stepOnce(): Promise<boolean> {
    const running = this.current;
    if (!running) return true;
    const { run, state } = running;
    let next: BotState;
    if (state.kind === 'market') {
      const choice = botMarketChoice(state);
      next = resolveMarketPlay(state, choice);
    } else if (state.kind === 'crypto') {
      next = await resolveCryptoPlay(state, botCryptoChoice(state));
    } else {
      next = resolveMillionPlay(state, botMillionChoice(state, running.rng));
    }
    running.state = next;
    run.moves = next.decisions;
    run.steps.push(stepLabel(next));
    if (next.outcome !== null) {
      run.outcome = next.outcome;
      run.ending = next.ending;
      run.name = next.name;
      run.result = finalResult(next);
      run.net = netResult(next);
      run.endedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  private finishRun(): void {
    const running = this.current;
    if (!running) return;
    const run = running.run;
    this.runs.push(run);
    if (this.runs.length > MAX_KEPT_RUNS) {
      this.runs = this.runs.slice(-MAX_KEPT_RUNS);
    }
    if (run.outcome === 'win') this.wins += 1;
    else if (run.outcome === 'lose') this.losses += 1;
    this.bankroll = round2(this.bankroll + run.net);
    this.current = null;
    this.seed += 1;
    this.modeIdx = (this.modeIdx + 1) % MODE_ORDER.length;
    void this.persist();
  }

  private persist(): Promise<void> {
    return Promise.resolve().then(() => {
      try {
        const dir = path.dirname(this.options.dataFile);
        if (dir) mkdirSync(dir, { recursive: true });
        writeFileSync(this.options.dataFile, JSON.stringify({ runs: this.runs }, null, 2));
      } catch {
        // the ledger is best-effort; the bot keeps running
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function botMarketChoice(state: MarketGameData): number {
  if (isMarketBake(state)) return 0;
  return 0;
}

function botCryptoChoice(state: CryptoGameData): number {
  if (isCryptoBake(state)) return 0;
  if (state.holding) {
    if (state.round >= 8) return 1;
    const price = cryptoPriceOf(state, state.holding.symbol);
    return price >= state.holding.entryPrice * 1.02 ? 1 : 2;
  }
  return 0;
}

function botMillionChoice(state: MillionGameData, rng: () => number): number {
  if (isMillionBake(state)) return 0;
  const question = state.questions[state.round];
  if (!question) return MILLION_WALK;
  const tier = state.round;
  if (tier >= 10 && !state.lives.fifty && question.options.length > 2) return MILLION_FIFTY;
  if (tier >= 12 && !state.lives.phone) return MILLION_PHONE;
  if (tier >= 13 && !state.lives.audience) return MILLION_AUDIENCE;
  if (state.bank >= 32000 && tier >= 13 && rng() < 0.5) return MILLION_WALK;
  const base = tier < 5 ? 0.85 : tier < 10 ? 0.75 : 0.6;
  const acc = state.hint && state.hint.kind === 'fifty' ? base + 0.2 : base;
  if (rng() < acc) return question.answer;
  const wrongs: number[] = [];
  for (let i = 0; i < question.options.length; i += 1) {
    if (i !== question.answer) wrongs.push(i);
  }
  return wrongs[Math.floor(rng() * wrongs.length)] ?? question.answer;
}

function stepLabel(state: BotState): string {
  const history = state.history as Array<MarketHistoryEntry | CryptoHistoryEntry | MillionHistoryEntry>;
  const last = history[history.length - 1];
  if (!last) return 'start';
  if (state.kind === 'market') {
    const entry = last as MarketHistoryEntry;
    return entry.action + ' ' + (entry.result >= 0 ? '+' : '') + entry.result.toFixed(2) + ' → ' + entry.purseAfter.toFixed(2);
  }
  if (state.kind === 'crypto') {
    const entry = last as CryptoHistoryEntry;
    return entry.action + ' ' + entry.coin + ' ' + (entry.result >= 0 ? '+' : '') + entry.result.toFixed(2) + ' → ' + entry.purseAfter.toFixed(2);
  }
  const entry = last as MillionHistoryEntry;
  if (entry.action === 'Correct') return 'Q' + entry.round + ' correct +$' + entry.tier;
  if (entry.action === 'Wrong') return 'Q' + entry.round + ' wrong → $' + entry.bankAfter;
  if (entry.action === 'Walked') return 'walk away $' + entry.tier;
  return 'Q' + entry.round + ' ' + entry.action.toLowerCase();
}

function currentView(running: Running): BotCurrentView {
  const { run, state } = running;
  let round: number;
  let rounds: number;
  let result: number;
  if (state.kind === 'market') {
    round = state.round;
    rounds = state.plays.length;
    result = state.purse;
  } else if (state.kind === 'crypto') {
    round = state.round;
    rounds = state.rounds;
    result = state.purse;
  } else {
    round = state.round;
    rounds = state.rounds;
    result = state.bank;
  }
  return {
    id: run.id,
    kind: run.kind,
    seed: run.seed,
    feed: run.feed,
    round,
    rounds,
    result,
    lastStep: run.steps[run.steps.length - 1] ?? null,
  };
}

function finalResult(state: BotState): number {
  return state.kind === 'million' ? state.won : state.purse;
}

function netResult(state: BotState): number {
  if (state.kind === 'million') return state.won;
  return round2(state.purse - state.startPurse);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
