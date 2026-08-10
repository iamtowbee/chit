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
  GAME_NAME,
  GAME_TAGLINE,
  ITEM_NAMES,
  nodeTitle,
  type GameContext,
} from './story.js';

export interface GameChoiceView {
  index: number;
  label: string;
}

export interface GameView {
  id: string;
  status: SessionStatus;
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
}

export interface GameSummary {
  id: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  moves: number;
  outcome: 'win' | 'lose' | null;
  nodeTitle: string;
  progress: number;
}

const IDLE_STATUSES: ReadonlySet<SessionStatus> = new Set(['paused', 'stalled']);

/**
 * Runs the "It's Cak" game. Every move is a Continue checkpoint, so a player can
 * close the tab and later resume the exact scene their cake was standing in.
 */
export class GameController {
  constructor(private readonly client: ContinueClient) {}

  async list(): Promise<GameSummary[]> {
    const sessions = await this.client.list(undefined, { limit: 100 });
    return sessions
      .filter((session) => session.metadata.app === 'game')
      .map((session) => this.summary(session))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(): Promise<GameView> {
    const session = await this.client.create({
      metadata: { app: 'game', title: GAME_NAME },
      totalSteps: 20,
      data: initialState(),
    });
    await this.client.queue(session.id);
    await this.client.start(session.id);
    await this.client.checkpoint(session.id, { step: 0, progress: 0 });
    return this.view(session.id);
  }

  async view(id: string): Promise<GameView> {
    const session = await this.client.get(id);
    const data = gameDataOf(session);
    const node = nodeAt(data);
    const ctx: GameContext = data;
    return {
      id: session.id,
      status: session.status,
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
    const data = gameDataOf(session);
    if (isTerminal(data)) {
      throw new HttpError(409, 'this game has already ended');
    }
    if (IDLE_STATUSES.has(session.status)) {
      await this.client.resume(id);
    }
    const next = applyChoice(data, choiceIndex);
    await this.client.checkpoint(id, {
      step: next.moves,
      progress: progress(next),
      data: next,
    });
    if (next.outcome !== null) {
      await this.client.complete(id, next);
      await this.client.finalize(id);
    }
    return this.view(id);
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

  private summary(session: Session): GameSummary {
    const data = isGameData(session.data) ? session.data : initialState();
    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      moves: data.moves,
      outcome: data.outcome,
      nodeTitle: nodeTitle(data.nodeId),
      progress: progress(data),
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

    router.post('/new', async (_req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(201).json({ game: await this.create() });
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
