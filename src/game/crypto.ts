export interface CryptoCoin {
  symbol: string;
  name: string;
  id: string;
  base: number;
}

export interface CryptoHolding {
  symbol: string;
  name: string;
  entryPrice: number;
  cost: number;
  shares: number;
}

export interface CryptoWindow {
  symbol: string;
  name: string;
  price: number;
  prevPrice: number;
}

export interface CryptoHistoryEntry {
  round: number;
  coin: string;
  action: string;
  price: number;
  stake: number;
  result: number;
  purseAfter: number;
}

export interface CryptoGameData {
  app: 'game';
  kind: 'crypto';
  source: 'sim' | 'live';
  seed: number;
  purse: number;
  startPurse: number;
  round: number;
  rounds: number;
  coin: CryptoWindow | null;
  holding: CryptoHolding | null;
  history: CryptoHistoryEntry[];
  buys: number;
  sells: number;
  passes: number;
  wins: number;
  losses: number;
  decisions: number;
  series: Record<string, number[]>;
  order: string[];
  prices: Record<string, number>;
  outcome: 'win' | 'lose' | null;
  ending: 'grand' | 'broke' | 'timid' | null;
  name: string | null;
}

const START_PURSE = 100;
const STAKE_FRACTION = 0.5;
const WIN_TARGET = 1.15;
const BROKE_FLOOR = 0.4;
export const CRYPTO_ROUNDS = 10;
export const CRYPTO_STAKE = STAKE_FRACTION;

export const CRYPTO_UNIVERSE: CryptoCoin[] = [
  { symbol: 'BTC', name: 'Bitcoin', id: 'bitcoin', base: 64000 },
  { symbol: 'ETH', name: 'Ethereum', id: 'ethereum', base: 1800 },
  { symbol: 'SOL', name: 'Solana', id: 'solana', base: 145 },
  { symbol: 'XRP', name: 'XRP', id: 'xrp', base: 0.6 },
  { symbol: 'DOGE', name: 'Dogecoin', id: 'dogecoin', base: 0.16 },
  { symbol: 'ADA', name: 'Cardano', id: 'cardano', base: 0.45 },
];

const COINGECKO = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false';

export interface CryptoCreateOptions {
  seed: number;
  live: boolean;
}

export async function initialCryptoGame(options: CryptoCreateOptions): Promise<CryptoGameData> {
  const base: CryptoGameData = {
    app: 'game' as const,
    kind: 'crypto' as const,
    source: (options.live ? 'live' : 'sim') as 'sim' | 'live',
    seed: options.seed,
    purse: START_PURSE,
    startPurse: START_PURSE,
    round: 0,
    rounds: CRYPTO_ROUNDS,
    coin: null,
    holding: null,
    history: [],
    buys: 0,
    sells: 0,
    passes: 0,
    wins: 0,
    losses: 0,
    decisions: 0,
    series: {},
    order: [],
    prices: {},
    outcome: null,
    ending: null,
    name: null,
  };
  if (options.live) {
    try {
      const prices = await fetchPrices();
      base.prices = prices;
    } catch {
      base.prices = fallbackPrices();
    }
  } else {
    base.series = buildSeries(options.seed);
    const order = CRYPTO_UNIVERSE.map((coin) => coin.symbol);
    base.order = [...order, ...order.slice(0, Math.max(0, CRYPTO_ROUNDS - order.length))];
  }
  base.coin = makeWindow(base, base.round);
  return base;
}

export function isCryptoGame(value: unknown): value is CryptoGameData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.app === 'game' &&
    record.kind === 'crypto' &&
    typeof record.purse === 'number' &&
    typeof record.rounds === 'number'
  );
}

export function isCryptoBake(state: CryptoGameData): boolean {
  return (
    state.round >= state.rounds &&
    state.outcome === null &&
    state.purse >= state.startPurse * WIN_TARGET
  );
}

export async function resolveCryptoPlay(
  state: CryptoGameData,
  choiceIndex: number,
): Promise<CryptoGameData> {
  const next: CryptoGameData = {
    ...state,
    holding: state.holding ? { ...state.holding } : null,
    history: [...state.history],
    prices: { ...state.prices },
    series: { ...state.series },
    order: [...state.order],
  };
  if (next.outcome !== null) {
    throw new Error('this game has already ended');
  }
  if (isCryptoBake(next)) {
    const names = ['Cakey the Brave', 'Sir Frostbite', 'Cak'];
    const name = names[choiceIndex];
    if (!name) throw new Error('that name is not available');
    next.outcome = 'win';
    next.ending = 'grand';
    next.name = name;
    return next;
  }
  if (next.source === 'live') {
    await refreshPrices(next);
  }
  const window = next.coin;
  if (!window) throw new Error('no market left to trade');
  const stake = round2(next.purse * STAKE_FRACTION);
  let action = '';
  let result = 0;
  let price = window.price;
  let coin = window.symbol;

  if (choiceIndex === 0) {
    if (next.holding) throw new Error('you are already holding a coin');
    next.purse = round2(next.purse - stake);
    next.holding = {
      symbol: window.symbol,
      name: window.name,
      entryPrice: window.price,
      cost: stake,
      shares: stake / window.price,
    };
    action = 'Buy ' + window.symbol;
    next.buys += 1;
  } else if (choiceIndex === 1) {
    const holding = next.holding;
    if (!holding) throw new Error('there is nothing to sell');
    const sellPrice = cryptoPriceOf(next, holding.symbol);
    const proceeds = holding.shares * sellPrice;
    result = round2(proceeds - holding.cost);
    next.purse = round2(next.purse + proceeds);
    next.holding = null;
    next.sells += 1;
    if (result >= 0) {
      next.wins += 1;
    } else {
      next.losses += 1;
    }
    action = 'Sell ' + holding.symbol;
    price = sellPrice;
    coin = holding.symbol;
  } else if (choiceIndex === 2) {
    action = 'Pass';
    next.passes += 1;
  } else {
    throw new Error('that choice is not available here');
  }

  next.decisions += 1;
  next.history.push({
    round: next.decisions,
    coin,
    action,
    price,
    stake: choiceIndex === 0 ? stake : result,
    result,
    purseAfter: next.purse,
  });

  next.round += 1;
  if (next.round >= next.rounds) {
    finalize(next);
  } else {
    next.coin = makeWindow(next, next.round);
  }
  return next;
}

function finalize(state: CryptoGameData): void {
  if (state.holding) {
    const holding = state.holding;
    const price = liquidationPrice(state, holding.symbol);
    const proceeds = holding.shares * price;
    const result = round2(proceeds - holding.cost);
    state.purse = round2(state.purse + proceeds);
    state.history.push({
      round: state.decisions,
      coin: holding.symbol,
      action: 'Liquidated',
      price,
      stake: result,
      result,
      purseAfter: state.purse,
    });
    state.holding = null;
  }
  if (state.purse <= state.startPurse * BROKE_FLOOR) {
    state.outcome = 'lose';
    state.ending = 'broke';
  } else if (state.purse < state.startPurse * WIN_TARGET) {
    state.outcome = 'lose';
    state.ending = 'timid';
  }
}

export function cryptoProgress(state: CryptoGameData): number {
  const total = state.rounds + (isCryptoBake(state) ? 1 : 0);
  return Math.min(1, (state.round + 1) / Math.max(1, total));
}

export function cryptoPriceOf(state: CryptoGameData, symbol: string): number {
  const meta = coinOf(symbol);
  if (state.source === 'live') {
    return state.prices[symbol] ?? meta.base;
  }
  const series = state.series[symbol] ?? [meta.base];
  return series[Math.min(state.round, series.length - 1)] ?? meta.base;
}

function makeWindow(state: CryptoGameData, round: number): CryptoWindow {
  const order = state.order.length > 0 ? state.order : CRYPTO_UNIVERSE.map((coin) => coin.symbol);
  const symbol = order[round] ?? order[round % order.length] ?? CRYPTO_UNIVERSE[0]!.symbol;
  const meta = coinOf(symbol);
  const prevPrice = state.prices[symbol] ?? meta.base;
  let price: number;
  if (state.source === 'live') {
    price = state.prices[symbol] ?? meta.base;
  } else {
    const series = state.series[symbol] ?? [meta.base];
    price = series[Math.min(round, series.length - 1)] ?? meta.base;
  }
  state.prices[symbol] = price;
  return { symbol, name: meta.name, price, prevPrice };
}

function liquidationPrice(state: CryptoGameData, symbol: string): number {
  const meta = coinOf(symbol);
  if (state.source === 'live') {
    return state.prices[symbol] ?? meta.base;
  }
  const series = state.series[symbol] ?? [meta.base];
  const idx = Math.min(CRYPTO_ROUNDS, series.length - 1);
  return series[idx] ?? meta.base;
}

function buildSeries(seed: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  CRYPTO_UNIVERSE.forEach((coin, index) => {
    const rng = mulberry32((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
    const prices = [coin.base];
    let prev = coin.base;
    for (let step = 0; step < CRYPTO_ROUNDS; step += 1) {
      const drift = (rng() - 0.45) * 0.12;
      prev = round2(prev * (1 + drift));
      prices.push(prev);
    }
    out[coin.symbol] = prices;
  });
  return out;
}

async function fetchPrices(): Promise<Record<string, number>> {
  const ids = CRYPTO_UNIVERSE.map((coin) => coin.id).join(',');
  const url = COINGECKO + '&ids=' + ids;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('coingecko HTTP ' + res.status);
  const list = (await res.json()) as Array<{ symbol?: string; current_price?: number }>;
  const prices: Record<string, number> = {};
  for (const item of list) {
    const symbol = String(item.symbol ?? '').toUpperCase();
    if (item.current_price != null && symbol) prices[symbol] = item.current_price;
  }
  return prices;
}

function fallbackPrices(): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const coin of CRYPTO_UNIVERSE) prices[coin.symbol] = coin.base;
  return prices;
}

async function refreshPrices(state: CryptoGameData): Promise<void> {
  try {
    const prices = await fetchPrices();
    for (const [symbol, price] of Object.entries(prices)) {
      state.prices[symbol] = price;
    }
    if (state.coin) {
      const fresh = prices[state.coin.symbol];
      if (fresh != null) {
        state.coin.prevPrice = state.coin.price;
        state.coin.price = fresh;
      }
    }
  } catch {
    // keep the last known prices; the game still plays on the stale feed
  }
}

function coinOf(symbol: string): CryptoCoin {
  return CRYPTO_UNIVERSE.find((coin) => coin.symbol === symbol) ?? CRYPTO_UNIVERSE[0]!;
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
