import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ContinueClient } from '../client.js';
import { HttpError } from '../errors.js';
import type { Session, SessionStatus } from '../types.js';
import {
  applyChoice,
  initialState,
  interpolate,
  isGameData,
  isTerminal,
  nodeAt,
  progress,
  type GameData,
} from './engine.js';
import {
  buildPlays,
  buildPlaysFromSnapshot,
  initialMarketGame,
  isBakePhase,
  isMarketGame,
  marketProgress,
  resolveMarketPlay,
  type MarketGameData,
  type MarketHistoryEntry,
  type MarketPlay,
} from './market.js';
import {
  CRYPTO_STAKE,
  cryptoPriceOf,
  cryptoProgress,
  initialCryptoGame,
  isCryptoBake,
  isCryptoGame,
  resolveCryptoPlay,
  type CryptoGameData,
  type CryptoHistoryEntry,
} from './crypto.js';
import {
  MILLION_AUDIENCE,
  MILLION_FIFTY,
  MILLION_PHONE,
  MILLION_ROUNDS,
  MILLION_TIERS,
  MILLION_WALK,
  initialMillionGame,
  isMillionBake,
  isMillionGame,
  millionProgress,
  resolveMillionPlay,
  safeFloorAt,
  tierAt,
  type MillionGameData,
  type MillionHint,
  type MillionHistoryEntry,
} from './million.js';
import {
  GAME_NAME,
  GAME_TAGLINE,
  ITEM_NAMES,
  nodeTitle,
  type GameContext,
} from './story.js';

export interface GameCreateInput {
  kind?: 'story' | 'market' | 'crypto' | 'million';
  mode?: 'sim' | 'file' | 'live';
  sourceUrl?: string;
  filename?: string;
  seed?: number;
  /** market only: trade the agent's latest downloaded snapshot instead of downloading or simulating */
  latest?: boolean;
}

export interface GameChoiceView {
  index: number;
  label: string;
}

export interface MarketView {
  purse: number;
  startPurse: number;
  round: number;
  rounds: number;
  phase: 'play' | 'bake' | 'end';
  arbs: number;
  gambles: number;
  passes: number;
  wins: number;
  losses: number;
  decisions: number;
  history: MarketHistoryEntry[];
  source: string;
  mode: 'sim' | 'file';
  question: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  bestReturn: number | null;
  ending: string | null;
  name: string | null;
}

export interface CryptoView {
  purse: number;
  startPurse: number;
  round: number;
  rounds: number;
  phase: 'play' | 'bake' | 'end';
  coin: { symbol: string; name: string; price: number; prevPrice: number; change: number } | null;
  holding: { symbol: string; name: string; entryPrice: number; cost: number; shares: number; unrealized: number } | null;
  buys: number;
  sells: number;
  passes: number;
  wins: number;
  losses: number;
  decisions: number;
  history: CryptoHistoryEntry[];
  source: string;
  ending: string | null;
  name: string | null;
}

export interface MillionView {
  round: number;
  rounds: number;
  phase: 'play' | 'bake' | 'end';
  bank: number;
  safeFloor: number;
  playingFor: number | null;
  question: { prompt: string; options: string[] } | null;
  lives: { fifty: boolean; phone: boolean; audience: boolean };
  hint: MillionHint | null;
  corrects: number;
  wrongs: number;
  walks: number;
  decisions: number;
  history: MillionHistoryEntry[];
  won: number;
  ending: string | null;
  name: string | null;
}

export interface GameView {
  id: string;
  status: SessionStatus;
  kind: 'story' | 'market' | 'crypto' | 'million';
  title: string;
  tagline: string;
  nodeId: string;
  nodeTitle: string;
  text: string;
  choices: GameChoiceView[];
  inventory: Array<{ id: string; label: string }>;
  flags: Record<string, string | boolean>;
  moves: number;
  progress: number;
  visitedCount: number;
  outcome: 'win' | 'lose' | null;
  checkpoints: number;
  market?: MarketView;
  crypto?: CryptoView;
  million?: MillionView;
}

export interface GameSummary {
  id: string;
  status: SessionStatus;
  kind: 'story' | 'market' | 'crypto' | 'million';
  createdAt: string;
  updatedAt: string;
  moves: number;
  outcome: 'win' | 'lose' | null;
  nodeTitle: string;
  progress: number;
}

const IDLE_STATUSES: ReadonlySet<SessionStatus> = new Set(['paused', 'stalled']);
const BAKE_NAMES = ['Cakey the Brave', 'Sir Frostbite', 'Cak'];

/**
 * Runs the games on the Chit platform. Two play styles share the Continue
 * runtime: the "It's Cak" story adventure, and the market game, which trades
 * the windows the agent's detection engine finds (sim or a downloaded
 * snapshot) with a seeded simulation resolving each bet.
 */
export class GameController {
  constructor(
    private readonly client: ContinueClient,
    private readonly downloadDir?: string,
  ) {}

  async list(): Promise<GameSummary[]> {
    const sessions = await this.client.list(undefined, { limit: 100 });
    return sessions
      .filter((session) => session.metadata.app === 'game')
      .map((session) => this.summary(session))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: GameCreateInput = {}): Promise<GameView> {
    if (input.kind === 'market') {
      return this.createMarket(input);
    }
    if (input.kind === 'crypto') {
      return this.createCrypto(input);
    }
    if (input.kind === 'million') {
      return this.createMillion(input);
    }
    const session = await this.client.create({
      metadata: { app: 'game', kind: 'story', title: GAME_NAME },
      totalSteps: 20,
      data: initialState(),
    });
    await this.client.queue(session.id);
    await this.client.start(session.id);
    await this.client.checkpoint(session.id, { step: 0, progress: 0 });
    return this.view(session.id);
  }

  private async createMarket(input: GameCreateInput): Promise<GameView> {
    const mode: 'sim' | 'file' = input.latest || input.sourceUrl ? 'file' : 'sim';
    const seed = Number.isInteger(input.seed) && (input.seed as number) >= 0
      ? (input.seed as number)
      : 1;
    const filename = input.latest
      ? input.filename?.trim() || 'market-snapshot.json'
      : input.filename?.trim();
    const source = mode === 'file'
      ? filename || input.sourceUrl || 'snapshot'
      : 'simulator';
    let plays: MarketPlay[];
    try {
      if (input.latest) {
        if (!this.downloadDir) {
          throw new Error('snapshot mode requires a download directory');
        }
        const built = await buildPlaysFromSnapshot(filename as string, this.downloadDir);
        plays = built.plays;
      } else {
        const built = await buildPlays({
          mode,
          sourceUrl: input.sourceUrl,
          filename,
          seed,
          downloadDir: this.downloadDir,
        });
        plays = built.plays;
      }
    } catch (err) {
      throw new HttpError(400, `could not build the market: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (plays.length === 0) {
      throw new HttpError(400, 'no tradable windows found in that market');
    }
    const session = await this.client.create({
      metadata: { app: 'game', kind: 'market', mode, source },
      totalSteps: plays.length,
      data: initialMarketGame(plays, { mode, seed, source }),
    });
    await this.client.queue(session.id);
    await this.client.start(session.id);
    await this.client.checkpoint(session.id, { step: 0, progress: 0 });
    return this.view(session.id);
  }

  private async createCrypto(input: GameCreateInput): Promise<GameView> {
    const live = input.mode === 'live';
    const seed = Number.isInteger(input.seed) && (input.seed as number) >= 0
      ? (input.seed as number)
      : 1;
    let state: CryptoGameData;
    try {
      state = await initialCryptoGame({ seed, live });
    } catch (err) {
      throw new HttpError(400, `could not open the crypto market: ${err instanceof Error ? err.message : String(err)}`);
    }
    const session = await this.client.create({
      metadata: {
        app: 'game',
        kind: 'crypto',
        mode: live ? 'live' : 'sim',
        source: live ? 'coingecko' : 'simulator',
      },
      totalSteps: state.rounds,
      data: state,
    });
    await this.client.queue(session.id);
    await this.client.start(session.id);
    await this.client.checkpoint(session.id, { step: 0, progress: 0 });
    return this.view(session.id);
  }

  private async createMillion(input: GameCreateInput): Promise<GameView> {
    const seed = Number.isInteger(input.seed) && (input.seed as number) >= 0
      ? (input.seed as number)
      : 1;
    const state = initialMillionGame({ seed });
    const session = await this.client.create({
      metadata: {
        app: 'game',
        kind: 'million',
        mode: 'trivia',
        source: 'question bank',
      },
      totalSteps: MILLION_ROUNDS,
      data: state,
    });
    await this.client.queue(session.id);
    await this.client.start(session.id);
    await this.client.checkpoint(session.id, { step: 0, progress: 0 });
    return this.view(session.id);
  }

  async view(id: string): Promise<GameView> {
    const session = await this.client.get(id);
    if (isMillionGame(session.data)) {
      return this.millionView(session, session.data);
    }
    if (isCryptoGame(session.data)) {
      return this.cryptoView(session, session.data);
    }
    if (isMarketGame(session.data)) {
      return this.marketView(session, session.data);
    }
    const data = gameDataOf(session);
    const node = nodeAt(data);
    const ctx: GameContext = data;
    return {
      id: session.id,
      status: session.status,
      kind: 'story',
      title: GAME_NAME,
      tagline: GAME_TAGLINE,
      nodeId: data.nodeId,
      nodeTitle: node.title,
      text: interpolate(node.text, ctx),
      choices: node.choices
        ? node.choices
            .filter((choice) => !choice.requires || choice.requires(ctx))
            .map((choice, index) => ({ index, label: choice.label }))
        : [],
      inventory: data.inventory.map((id) => ({
        id,
        label: ITEM_NAMES[id] ?? id,
      })),
      flags: { ...data.flags },
      moves: data.moves,
      progress: progress(data),
      visitedCount: data.visited.length,
      outcome: data.outcome,
      checkpoints: session.checkpoints.length,
    };
  }

  async act(id: string, choiceIndex: number): Promise<GameView> {
    const session = await this.client.get(id);
    const data = session.data;
    if (isMillionGame(data)) {
      return this.actMillion(session, data, choiceIndex);
    }
    if (isCryptoGame(data)) {
      return this.actCrypto(session, data, choiceIndex);
    }
    if (isMarketGame(data)) {
      return this.actMarket(session, data, choiceIndex);
    }
    const story = gameDataOf(session);
    if (isTerminal(story)) {
      throw new HttpError(409, 'this game has already ended');
    }
    if (IDLE_STATUSES.has(session.status)) {
      await this.client.resume(id);
    }
    const next = applyChoice(story, choiceIndex);
    await this.checkpoint(id, next.moves, progress(next), next);
    if (next.outcome !== null) {
      await this.client.complete(id, next);
      await this.client.finalize(id);
    }
    return this.view(id);
  }

  private async actMillion(
    session: Session,
    data: MillionGameData,
    choiceIndex: number,
  ): Promise<GameView> {
    if (data.outcome !== null) {
      throw new HttpError(409, 'this game has already ended');
    }
    if (IDLE_STATUSES.has(session.status)) {
      await this.client.resume(session.id);
    }
    const next = resolveMillionPlay(data, choiceIndex);
    await this.checkpoint(session.id, next.decisions, millionProgress(next), next);
    if (next.outcome !== null) {
      await this.client.complete(session.id, next);
      await this.client.finalize(session.id);
    }
    return this.view(session.id);
  }

  private async actMarket(
    session: Session,
    data: MarketGameData,
    choiceIndex: number,
  ): Promise<GameView> {
    if (data.outcome !== null) {
      throw new HttpError(409, 'this game has already ended');
    }
    if (IDLE_STATUSES.has(session.status)) {
      await this.client.resume(session.id);
    }
    const next = resolveMarketPlay(data, choiceIndex);
    await this.checkpoint(session.id, next.decisions, marketProgress(next), next);
    if (next.outcome !== null) {
      await this.client.complete(session.id, next);
      await this.client.finalize(session.id);
    }
    return this.view(session.id);
  }

  private async actCrypto(
    session: Session,
    data: CryptoGameData,
    choiceIndex: number,
  ): Promise<GameView> {
    if (data.outcome !== null) {
      throw new HttpError(409, 'this game has already ended');
    }
    if (IDLE_STATUSES.has(session.status)) {
      await this.client.resume(session.id);
    }
    const next = await resolveCryptoPlay(data, choiceIndex);
    await this.checkpoint(session.id, next.decisions, cryptoProgress(next), next);
    if (next.outcome !== null) {
      await this.client.complete(session.id, next);
      await this.client.finalize(session.id);
    }
    return this.view(session.id);
  }

  private async checkpoint(id: string, step: number, value: number, data: unknown): Promise<void> {
    await this.client.checkpoint(id, { step, progress: value, data });
  }

  async pause(id: string): Promise<GameView> {
    await this.client.pause(id);
    return this.view(id);
  }

  async resume(id: string): Promise<GameView> {
    await this.client.resume(id);
    return this.view(id);
  }

  async abandon(id: string): Promise<GameView> {
    await this.client.cancel(id, 'abandoned by the player');
    return this.view(id);
  }

  private marketView(session: Session, data: MarketGameData): GameView {
    const current = data.plays[data.round] ?? null;
    const bake = isBakePhase(data);
    const ended = data.outcome !== null;
    let title: string;
    let text: string;
    let choices: GameChoiceView[] = [];
    if (ended) {
      title = data.ending === 'grand' ? 'The Grand Bake' : data.ending === 'broke' ? 'Crumb broke' : 'Window closed';
      text = endingText(data);
    } else if (bake) {
      title = 'The Grand Bake';
      text =
        'With ' +
        data.purse.toFixed(2) +
        ' frostings banked, the win is yours. ' +
        'Cak, choose the name for the record books.';
      choices = BAKE_NAMES.map((name, index) => ({ index, label: `Name yourself ${name}` }));
    } else if (current) {
      title = current.question;
      text =
        'The Ovenlands exchange flashes a new window. Yes trades at ' +
        current.yesPrice.toFixed(2) +
        ', No at ' +
        current.noPrice.toFixed(2) +
        ' — together they sum to ' +
        (current.yesPrice + current.noPrice).toFixed(2) +
        ', so buying the pair locks a guaranteed ' +
        (current.bestReturn * 100).toFixed(2) +
        '% return. Or gamble a single side: the market resolves Yes or No.';
      choices = [
        { index: 0, label: `Arbitrage — lock in +${(current.bestReturn * 100).toFixed(2)}%` },
        { index: 1, label: `Buy Yes at $${current.yesPrice.toFixed(2)}` },
        { index: 2, label: `Buy No at $${current.noPrice.toFixed(2)}` },
        { index: 3, label: 'Pass this window' },
      ];
    } else {
      title = 'The market is quiet';
      text = 'No windows are open right now.';
    }

    return {
      id: session.id,
      status: session.status,
      kind: 'market',
      title: GAME_NAME,
      tagline: 'Played on the market — trade the windows, chase the Grand Bake.',
      nodeId: current?.id ?? 'market',
      nodeTitle: title,
      text,
      choices,
      inventory: [],
      flags: {},
      moves: data.decisions,
      progress: marketProgress(data),
      visitedCount: data.decisions,
      outcome: data.outcome,
      checkpoints: session.checkpoints.length,
      market: {
        purse: data.purse,
        startPurse: data.startPurse,
        round: data.round,
        rounds: data.plays.length,
        phase: ended ? 'end' : bake ? 'bake' : 'play',
        arbs: data.arbs,
        gambles: data.gambles,
        passes: data.passes,
        wins: data.wins,
        losses: data.losses,
        decisions: data.decisions,
        history: data.history,
        source: data.source,
        mode: data.mode,
        question: current?.question ?? null,
        yesPrice: current?.yesPrice ?? null,
        noPrice: current?.noPrice ?? null,
        bestReturn: current?.bestReturn ?? null,
        ending: data.ending,
        name: data.name,
      },
    };
  }

  private cryptoView(session: Session, data: CryptoGameData): GameView {
    const ended = data.outcome !== null;
    const bake = isCryptoBake(data);
    const coin = ended || bake ? null : data.coin;
    const holding = data.holding;
    const heldPrice = holding ? cryptoPriceOf(data, holding.symbol) : null;
    const stake = round2(data.purse * CRYPTO_STAKE);
    let title: string;
    let text: string;
    let choices: GameChoiceView[] = [];
    if (ended) {
      title = data.ending === 'grand' ? 'The Grand Bake' : data.ending === 'broke' ? 'Wallet empty' : 'Market closed';
      text = cryptoEndingText(data);
    } else if (bake) {
      title = 'The Grand Bake';
      text =
        'Your wallet holds ' +
        data.purse.toFixed(2) +
        ' frostings — banked the hard way, coin by coin. ' +
        'Cak, choose the name for the record books.';
      choices = BAKE_NAMES.map((name, index) => ({ index, label: `Name yourself ${name}` }));
    } else if (holding && heldPrice !== null) {
      const change = heldPrice > 0 ? (heldPrice - holding.entryPrice) / holding.entryPrice : 0;
      title = holding.symbol + ' — $' + heldPrice.toFixed(2);
      text =
        'You are holding ' +
        holding.symbol +
        ' entered at $' +
        holding.entryPrice.toFixed(2) +
        ' — now trading at $' +
        heldPrice.toFixed(2) +
        ', ' +
        (change >= 0 ? 'up ' : 'down ') +
        Math.abs(change * 100).toFixed(1) +
        '%. Sell into the market, or hold for a better moment. ' +
        (coin ? coin.name + ' also flashes a window (' + coin.symbol + ' — $' + coin.price.toFixed(2) + ').' : '');
      choices = [
        { index: 1, label: `Sell ${holding.symbol} @ $${heldPrice.toFixed(2)}` },
        { index: 2, label: 'Pass (keep holding)' },
      ];
    } else if (coin) {
      const change = coin.prevPrice > 0 ? (coin.price - coin.prevPrice) / coin.prevPrice : 0;
      title = coin.symbol + ' — $' + coin.price.toFixed(2);
      text =
        coin.name +
        ' trades at $' +
        coin.price.toFixed(2) +
        ', ' +
        (change >= 0 ? 'up ' : 'down ') +
        Math.abs(change * 100).toFixed(1) +
        '% since the last check. Buy a $' +
        stake.toFixed(2) +
        ' stake and hope it grows, or pass and wait for a better moment.';
      choices = [
        { index: 0, label: `Buy ${coin.symbol} for $${stake.toFixed(2)}` },
        { index: 2, label: 'Pass this window' },
      ];
    } else {
      title = 'The market is quiet';
      text = 'No coins are on the board right now.';
    }

    let unrealized = 0;
    if (holding && heldPrice !== null) {
      unrealized = round2((heldPrice - holding.entryPrice) * holding.shares);
    }

    return {
      id: session.id,
      status: session.status,
      kind: 'crypto',
      title: GAME_NAME,
      tagline: 'Played on the live market — buy low, sell high, chase the Grand Bake.',
      nodeId: coin?.symbol ?? 'crypto',
      nodeTitle: title,
      text,
      choices,
      inventory: [],
      flags: {},
      moves: data.decisions,
      progress: cryptoProgress(data),
      visitedCount: data.decisions,
      outcome: data.outcome,
      checkpoints: session.checkpoints.length,
      crypto: {
        purse: data.purse,
        startPurse: data.startPurse,
        round: data.round,
        rounds: data.rounds,
        phase: ended ? 'end' : bake ? 'bake' : 'play',
        coin: coin
          ? {
              symbol: coin.symbol,
              name: coin.name,
              price: coin.price,
              prevPrice: coin.prevPrice,
              change: coin.prevPrice > 0 ? (coin.price - coin.prevPrice) / coin.prevPrice : 0,
            }
          : null,
        holding: holding
          ? {
              symbol: holding.symbol,
              name: holding.name,
              entryPrice: holding.entryPrice,
              cost: holding.cost,
              shares: holding.shares,
              unrealized,
            }
          : null,
        buys: data.buys,
        sells: data.sells,
        passes: data.passes,
        wins: data.wins,
        losses: data.losses,
        decisions: data.decisions,
        history: data.history,
        source: data.source === 'live' ? 'coingecko' : 'simulator',
        ending: data.ending,
        name: data.name,
      },
    };
  }

  private millionView(session: Session, data: MillionGameData): GameView {
    const bake = isMillionBake(data);
    const ended = data.outcome !== null;
    const question = ended || bake ? null : data.questions[data.round] ?? null;
    const playingFor = question ? tierAt(data.round) : null;
    let title: string;
    let text: string;
    let choices: GameChoiceView[] = [];
    if (ended) {
      title = data.ending === 'grand' ? 'The Grand Bake' : data.ending === 'walk' ? 'Walking away' : 'The buzzer rings';
      text = millionEndingText(data);
    } else if (bake) {
      title = 'The Grand Bake';
      text =
        'Fifteen questions, fifteen right answers, and a million frostings banked. ' +
        'Cak, choose the name for the record books.';
      choices = BAKE_NAMES.map((name, index) => ({ index, label: `Name yourself ${name}` }));
    } else if (question) {
      title = question.prompt;
      text =
        'The hot seat glows. For $' +
        playingFor!.toFixed(0) +
        ', ' +
        question.prompt +
        ' The safe floor is $' +
        data.safeFloor.toFixed(0) +
        ' if the buzzer catches you.';
      choices = question.options.map((option, index) => ({ index, label: option }));
      if (!data.lives.fifty && question.options.length > 2) {
        choices.push({ index: MILLION_FIFTY, label: '50/50 — remove two wrong answers' });
      }
      if (!data.lives.phone) {
        choices.push({ index: MILLION_PHONE, label: 'Phone a friend' });
      }
      if (!data.lives.audience) {
        choices.push({ index: MILLION_AUDIENCE, label: 'Ask the audience' });
      }
      choices.push({ index: MILLION_WALK, label: `Walk away with $${data.bank.toFixed(0)}` });
    } else {
      title = 'The studio is empty';
      text = 'No question is on the board right now.';
    }

    return {
      id: session.id,
      status: session.status,
      kind: 'million',
      title: GAME_NAME,
      tagline: 'Played on the hot seat — fifteen questions, chase the million.',
      nodeId: question ? 'q' + (data.round + 1) : 'million',
      nodeTitle: title,
      text,
      choices,
      inventory: [],
      flags: {},
      moves: data.decisions,
      progress: millionProgress(data),
      visitedCount: data.decisions,
      outcome: data.outcome,
      checkpoints: session.checkpoints.length,
      million: {
        round: data.round,
        rounds: MILLION_ROUNDS,
        phase: ended ? 'end' : bake ? 'bake' : 'play',
        bank: data.bank,
        safeFloor: data.safeFloor,
        playingFor,
        question: question ? { prompt: question.prompt, options: question.options } : null,
        lives: { ...data.lives },
        hint: data.hint,
        corrects: data.corrects,
        wrongs: data.wrongs,
        walks: data.walks,
        decisions: data.decisions,
        history: data.history,
        won: data.won,
        ending: data.ending,
        name: data.name,
      },
    };
  }

  private summary(session: Session): GameSummary {
    const data = session.data;
    if (isMillionGame(data)) {
      const question = data.questions[data.round];
      return {
        id: session.id,
        status: session.status,
        kind: 'million',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        moves: data.decisions,
        outcome: data.outcome,
        nodeTitle: question ? question.prompt : 'the Grand Bake',
        progress: millionProgress(data),
      };
    }
    if (isCryptoGame(data)) {
      const window = data.coin;
      return {
        id: session.id,
        status: session.status,
        kind: 'crypto',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        moves: data.decisions,
        outcome: data.outcome,
        nodeTitle: window ? window.symbol + ' — $' + window.price.toFixed(2) : 'the Grand Bake',
        progress: cryptoProgress(data),
      };
    }
    if (isMarketGame(data)) {
      const current = data.plays[data.round];
      return {
        id: session.id,
        status: session.status,
        kind: 'market',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        moves: data.decisions,
        outcome: data.outcome,
        nodeTitle: current?.question ?? 'the Grand Bake',
        progress: marketProgress(data),
      };
    }
    const story = isGameData(data) ? data : initialState();
    return {
      id: session.id,
      status: session.status,
      kind: 'story',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      moves: story.moves,
      outcome: story.outcome,
      nodeTitle: nodeTitle(story.nodeId),
      progress: progress(story),
    };
  }

  router(): express.Router {
    const router = express.Router();
    router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({ games: await this.list() });
      } catch (err) {
        next(err);
      }
    });

    router.post('/new', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = (req.body ?? {}) as Partial<GameCreateInput>;
        const kind = body.kind === 'market' ? 'market' : body.kind === 'crypto' ? 'crypto' : body.kind === 'million' ? 'million' : 'story';
        const game = await this.create({
          kind,
          mode: body.mode,
          sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
          filename: typeof body.filename === 'string' ? body.filename : undefined,
          latest: body.latest === true,
          seed: body.seed,
        });
        res.status(201).json({ game });
      } catch (err) {
        next(err);
      }
    });

    router.get(
      '/:id',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          res.json({ game: await this.view(req.params.id!) });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/:id/act',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const choice = Number((req.body ?? {}).choice);
          if (!Number.isInteger(choice) || choice < 0) {
            throw new HttpError(400, 'choice must be a non-negative integer');
          }
          res.json({ game: await this.act(req.params.id!, choice) });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/:id/pause',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          res.json({ game: await this.pause(req.params.id!) });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/:id/resume',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          res.json({ game: await this.resume(req.params.id!) });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/:id/abandon',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          res.json({ game: await this.abandon(req.params.id!) });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  }
}

function gameDataOf(session: Session): GameData {
  if (!isGameData(session.data)) {
    throw new HttpError(404, 'not a game session');
  }
  return session.data;
}

function endingText(data: MarketGameData): string {
  if (data.ending === 'grand') {
    return (
      'From ' +
      data.startPurse.toFixed(0) +
      ' frostings, ' +
      (data.name ?? 'Cak') +
      ' traded to ' +
      data.purse.toFixed(2) +
      ', locking ' +
      data.arbs +
      ' arbitrage windows along the way.'
    );
  }
  if (data.ending === 'broke') {
    return (
      'Your purse of frostings runs dry: ' +
      data.wins +
      ' wins, ' +
      data.losses +
      ' losses. The market always opens another window — start again.'
    );
  }
  return (
    'The windows close with ' +
    data.purse.toFixed(2) +
    ' frostings banked — short of the goal. The market will open again tomorrow.'
  );
}

function cryptoEndingText(data: CryptoGameData): string {
  if (data.ending === 'grand') {
    return (
      (data.name ?? 'Cak') +
      ' turned ' +
      data.startPurse.toFixed(0) +
      ' frostings into ' +
      data.purse.toFixed(2) +
      ' with ' +
      data.buys +
      ' buys and ' +
      data.sells +
      ' sells across the coin boards.'
    );
  }
  if (data.ending === 'broke') {
    return (
      'The wallet hits zero: ' +
      data.wins +
      ' good trades, ' +
      data.losses +
      ' bad ones. The coins will be here tomorrow — start again.'
    );
  }
  return (
    'The boards close with ' +
    data.purse.toFixed(2) +
    ' frostings banked — short of the goal. Trade again at first light.'
  );
}

function millionEndingText(data: MillionGameData): string {
  if (data.ending === 'grand') {
    return (
      (data.name ?? 'Cak') +
      ' answered fifteen straight and banked a million frostings.'
    );
  }
  if (data.ending === 'walk') {
    if (data.won > 0) {
      return (
        'Cak steps out of the hot seat, cashing ' +
        data.won.toFixed(0) +
        ' frostings. The million stays unclaimed, but a baker who walks away whole is a baker who bakes another day.'
      );
    }
    return 'Cak leaves the hot seat before the first question — pockets empty, but head held high. The million can wait.';
  }
  if (data.ending === 'broke') {
    return (
      'The buzzer rings before the first safe haven. Cak leaves with nothing but the question ringing in the ears, ' +
      'and the resolve to study the ovenlands by heart.'
    );
  }
  return (
    'The buzzer rings. Cak drops to the safe floor of ' +
    data.won.toFixed(0) +
    ' frostings — ' +
    (data.won >= 32000 ? 'enough to rebuild and return.' : 'a humble nest egg for the road ahead.') +
    ' The Grand Bake waits for a sharper mind.'
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
