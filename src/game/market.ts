import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseSnapshot } from '../agent.js';
import { downloadRange } from '../downloader.js';
import { engine } from '../ollyba/engine.js';
import { Simulator } from '../ollyba/simulator.js';
import type { Market, Opportunity } from '../ollyba/types.js';

export interface MarketPlay {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  bestReturn: number;
  type: 'within-market' | 'cross-market';
}

export interface MarketHistoryEntry {
  round: number;
  question: string;
  action: string;
  stake: number;
  result: number;
  purseAfter: number;
}

export interface MarketGameData {
  app: 'game';
  kind: 'market';
  mode: 'sim' | 'file';
  seed: number;
  source: string;
  purse: number;
  startPurse: number;
  round: number;
  plays: MarketPlay[];
  decisions: number;
  arbs: number;
  gambles: number;
  passes: number;
  wins: number;
  losses: number;
  history: MarketHistoryEntry[];
  outcome: 'win' | 'lose' | null;
  ending: 'grand' | 'broke' | 'timid' | null;
  name: string | null;
}

export interface BuildPlaysOptions {
  mode: 'sim' | 'file';
  sourceUrl?: string;
  filename?: string;
  seed?: number;
  downloadDir?: string;
}

const START_PURSE = 100;
const STAKE_FRACTION = 0.25;
const WIN_TARGET = 1.15;
const BROKE_FLOOR = 0.4;
export const MAX_PLAYS = 10;

export function initialMarketGame(
  plays: MarketPlay[],
  options: { mode: 'sim' | 'file'; seed: number; source: string },
): MarketGameData {
  return {
    app: 'game',
    kind: 'market',
    mode: options.mode,
    seed: options.seed,
    source: options.source,
    purse: START_PURSE,
    startPurse: START_PURSE,
    round: 0,
    plays,
    decisions: 0,
    arbs: 0,
    gambles: 0,
    passes: 0,
    wins: 0,
    losses: 0,
    history: [],
    outcome: null,
    ending: null,
    name: null,
  };
}

export function isMarketGame(value: unknown): value is MarketGameData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.app === 'game' &&
    record.kind === 'market' &&
    typeof record.purse === 'number' &&
    Array.isArray(record.plays)
  );
}

function playsFromMarkets(markets: Market[]): {
  plays: MarketPlay[];
  markets: number;
} {
  const opportunities = engine.detect(markets, { minReturn: 0.001 });
  return {
    plays: opportunities.slice(0, MAX_PLAYS).map(toPlay),
    markets: markets.length,
  };
}

export async function buildPlays(options: BuildPlaysOptions): Promise<{
  plays: MarketPlay[];
  markets: number;
}> {
  if (options.mode === 'file' && options.sourceUrl) {
    if (!options.downloadDir) {
      throw new Error('file mode requires a download directory');
    }
    const filename = options.filename?.trim() || 'market-snapshot.json';
    const downloadDir = options.downloadDir;
    await mkdir(downloadDir, { recursive: true });
    const partPath = path.join(downloadDir, `${filename}.part`);
    const finalPath = path.join(downloadDir, filename);
    await downloadRange(options.sourceUrl, partPath, 0);
    await rename(partPath, finalPath);
    const markets = (await parseSnapshot(finalPath)) ?? [];
    return playsFromMarkets(markets);
  }
  const simulator = new Simulator({ seed: options.seed ?? 1, events: 16 });
  const markets: Market[] = [];
  for (let tick = 0; tick < 10 && markets.length < 60; tick += 1) {
    markets.push(...(await simulator.next()));
  }
  return playsFromMarkets(markets);
}

/**
 * Build plays straight from a snapshot the trading agent already downloaded.
 * No network, no source URL: the game trades the same data the agent scanned.
 */
export async function buildPlaysFromSnapshot(
  filename: string,
  downloadDir: string,
): Promise<{ plays: MarketPlay[]; markets: number }> {
  const filePath = path.join(downloadDir, filename);
  const snapshot = await parseSnapshot(filePath);
  if (!snapshot || snapshot.length === 0) {
    throw new Error(`no markets in snapshot ${filename}`);
  }
  return playsFromMarkets(snapshot);
}

export function isBakePhase(state: MarketGameData): boolean {
  return (
    state.round >= state.plays.length &&
    state.outcome === null &&
    state.purse >= state.startPurse * WIN_TARGET
  );
}

export function resolveMarketPlay(
  state: MarketGameData,
  choiceIndex: number,
): MarketGameData {
  const next: MarketGameData = {
    ...state,
    plays: state.plays.map((play) => ({ ...play })),
    history: [...state.history],
  };
  if (next.outcome !== null) {
    throw new Error('this game has already ended');
  }
  if (isBakePhase(next)) {
    const names = ['Cakey the Brave', 'Sir Frostbite', 'Cak'];
    const name = names[choiceIndex];
    if (!name) throw new Error('that name is not available');
    next.outcome = 'win';
    next.ending = 'grand';
    next.name = name;
    return next;
  }
  const play = next.plays[next.round];
  if (!play) throw new Error('no market left to trade');
  if (choiceIndex < 0 || choiceIndex > 3) {
    throw new Error('that choice is not available here');
  }

  const stake = round2(next.purse * STAKE_FRACTION);
  let action = '';
  let result = 0;
  const pYes = play.yesPrice + play.noPrice > 0
    ? play.yesPrice / (play.yesPrice + play.noPrice)
    : 0.5;

  if (choiceIndex === 0) {
    action = 'Arbitrage';
    result = next.purse * play.bestReturn;
    next.arbs += 1;
  } else if (choiceIndex === 1 || choiceIndex === 2) {
    const price = choiceIndex === 1 ? play.yesPrice : play.noPrice;
    const wantYes = choiceIndex === 1;
    const resolvedYes = resolveEvent(pYes, next.seed, next.decisions);
    const won = wantYes ? resolvedYes : !resolvedYes;
    next.gambles += 1;
    if (won) {
      result = price > 0 ? stake * (1 / price - 1) : 0;
      next.wins += 1;
    } else {
      result = -stake;
      next.losses += 1;
    }
    action = wantYes ? 'Buy Yes' : 'Buy No';
  } else {
    action = 'Pass';
    next.passes += 1;
  }

  next.purse = round2(next.purse + result);
  next.decisions += 1;
  next.round += 1;
  next.history.push({
    round: next.decisions,
    question: play.question,
    action,
    stake,
    result: round2(result),
    purseAfter: next.purse,
  });

  if (next.purse <= next.startPurse * BROKE_FLOOR) {
    next.outcome = 'lose';
    next.ending = 'broke';
  } else if (next.round >= next.plays.length && next.purse < next.startPurse * WIN_TARGET) {
    next.outcome = 'lose';
    next.ending = 'timid';
  }
  return next;
}

export function marketProgress(state: MarketGameData): number {
  const total = state.plays.length + (isBakePhase(state) ? 1 : 0);
  return Math.min(1, (state.round + 1) / Math.max(1, total));
}

function toPlay(opportunity: Opportunity): MarketPlay {
  const yes = opportunity.legs.find(
    (leg) => leg.outcome.toLowerCase() === 'yes',
  );
  const no = opportunity.legs.find(
    (leg) => leg.outcome.toLowerCase() === 'no',
  );
  const yesPrice = yes?.price ?? opportunity.legs[0]?.price ?? 0;
  const noPrice = no?.price ?? opportunity.legs[1]?.price ?? 0;
  return {
    id: opportunity.legs.map((leg) => leg.marketId).join('+'),
    question: opportunity.legs[0]?.question ?? 'the Ovenlands exchange',
    yesPrice,
    noPrice,
    bestReturn: opportunity.netReturn,
    type: opportunity.type,
  };
}

function resolveEvent(pYes: number, seed: number, decisions: number): boolean {
  const rng = mulberry32((seed ^ Math.imul(decisions + 1, 2654435761)) >>> 0);
  return rng() < pYes;
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
