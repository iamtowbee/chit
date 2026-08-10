import {
  NODES,
  START_NODE,
  TOTAL_NODES,
  type GameChoice,
  type GameContext,
  type GameNode,
} from './story.js';

export interface GameData {
  app: 'game';
  nodeId: string;
  visited: string[];
  inventory: string[];
  flags: Record<string, string | boolean>;
  moves: number;
  outcome: 'win' | 'lose' | null;
}

export function initialState(): GameData {
  return {
    app: 'game',
    nodeId: START_NODE,
    visited: [START_NODE],
    inventory: [],
    flags: {},
    moves: 0,
    outcome: null,
  };
}

export function isGameData(value: unknown): value is GameData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.app === 'game' &&
    typeof record.nodeId === 'string' &&
    Array.isArray(record.inventory)
  );
}

export function nodeAt(data: GameData): GameNode {
  return NODES[data.nodeId] ?? (NODES[START_NODE] as GameNode);
}

export function isTerminal(data: GameData): boolean {
  return data.outcome !== null;
}

export function availableChoices(node: GameNode, ctx: GameContext): GameChoice[] {
  if (!node.choices) return [];
  return node.choices.filter((choice) => !choice.requires || choice.requires(ctx));
}

export function progress(data: GameData): number {
  return Math.min(1, data.visited.length / TOTAL_NODES);
}

export function interpolate(text: string, ctx: GameContext): string {
  const name = typeof ctx.flags.name === 'string' ? ctx.flags.name : 'Cak';
  return text.replace(/\{\{NAME\}\}/g, name);
}

export function applyChoice(data: GameData, choiceIndex: number): GameData {
  const node = nodeAt(data);
  if (node.ending) {
    throw new Error('this game has already ended');
  }
  const choices = availableChoices(node, data);
  const choice = choices[choiceIndex];
  if (!choice) {
    throw new Error('that choice is not available here');
  }
  const next: GameData = {
    ...data,
    visited: [...data.visited],
    inventory: [...data.inventory],
    flags: { ...data.flags },
  };
  if (choice.effect) choice.effect(next);
  next.nodeId = choice.to;
  if (!next.visited.includes(next.nodeId)) {
    next.visited.push(next.nodeId);
  }
  const entered = NODES[next.nodeId];
  if (entered?.onEnter) entered.onEnter(next);
  if (entered?.ending) {
    next.outcome = entered.ending;
  }
  next.moves += 1;
  return next;
}
