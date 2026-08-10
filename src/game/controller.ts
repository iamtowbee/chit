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
  GAME_NAME,
  GAME_TAGLINE,
  ITEM_NAMES,
  nodeTitle,
  type GameContext,
} from './story.js';

export interface GameCreateInput {
  kind?: 'story' | 'market' | 'crypto';
  mode?: 'sim' | 'file' | 'live';
  sourceUrl?: string;
  filename?: string;
  seed?: number;
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

export interface GameView {
  id: string;
  status: SessionStatus;
  kind: 'story' | 'market' | 'crypto';
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
}

export interface GameSummary {
  id: string;
  status: SessionStatus;
  kind: 'story' | 'market' | 'crypto';
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
    const mode: 'sim' | 'file' = input.sourceUrl ? 'file' : 'sim';
    const seed = Number.isInteger(input.seed) && (input.seed as number) >= 0
      ? (input.seed as number)
      : 1;
    const source = mode === 'file'
      ? input.filename?.trim() || input.sourceUrl || 'snapshot'
      : 'simulator';
    let plays: MarketPlay[];
    try {
      const built = await buildPlays({
        mode,
        sourceUrl: input.sourceUrl,
        filename: input.filename,
        seed,
        downloadDir: this.downloadDir,
      });
      plays = built.plays;
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

  async view(id: string): Promise<GameView> {
    const session = await this.client.get(id);
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
        'The Ovenlight rises. With ' +
        data.purse.toFixed(2) +
        ' frostings in your purse, you have earned the right to a name. ' +
        'Cak, choose it wisely.';
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
        'The Ovenlight rises. Your wallet holds ' +
        data.purse.toFixed(2) +
        ' frostings — earned the hard way, coin by coin. ' +
        'Cak, choose the name that will be told across the ovenlands.';
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

  private summary(session: Session): GameSummary {
    const data = session.data;
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
        const kind = body.kind === 'market' ? 'market' : body.kind === 'crypto' ? 'crypto' : 'story';
        const game = await this.create({
          kind,
          mode: body.mode,
          sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
          filename: typeof body.filename === 'string' ? body.filename : undefined,
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
      'The Great Oven opens its door to you, ' +
      (data.name ?? 'Cak') +
      '. From ' +
      data.startPurse.toFixed(0) +
      ' frostings you traded your way to ' +
      data.purse.toFixed(2) +
      ', locking ' +
      data.arbs +
      ' arbitrage windows. You chose yourself — one warm answer at a time.'
    );
  }
  if (data.ending === 'broke') {
    return (
      'Your purse of frostings runs dry. The exchange closes its ledger on you, and ' +
      'Cak limps back to the Ovenlands with ' +
      data.wins +
      ' wins and ' +
      data.losses +
      ' losses to remember. The market always has another window — start again.'
    );
  }
  return (
    'The windows close and your purse holds ' +
    data.purse.toFixed(2) +
    ' frostings — not enough for the Grand Bake. ' +
    'Cak is not broke, but Cak is not brave. The Grand Bake needs one more spark; the market will be open tomorrow.'
  );
}

function cryptoEndingText(data: CryptoGameData): string {
  if (data.ending === 'grand') {
    return (
      'The Great Oven opens its door to you, ' +
      (data.name ?? 'Cak') +
      '. You turned ' +
      data.startPurse.toFixed(0) +
      ' frostings into ' +
      data.purse.toFixed(2) +
      ' by ' +
      data.buys +
      ' buys and ' +
      data.sells +
      ' sells across the coin boards. Cak chose the market, and the market chose Cak.'
    );
  }
  if (data.ending === 'broke') {
    return (
      'Your wallet empties to nothing. Cak stares at the ticker with ' +
      data.wins +
      ' good trades and ' +
      data.losses +
      ' bad ones. Every great baker starts over — the coins will be here tomorrow.'
    );
  }
  return (
    'The boards close and your wallet holds ' +
    data.purse.toFixed(2) +
    ' frostings — not enough for the Grand Bake. ' +
    'Cak learned the ticker but not the nerve. The market will be open again at first light.'
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
