import type { ArbLeg, Opportunity } from './types.js';

export interface Fill {
  filled: boolean;
  orderId?: string;
  note: string;
}

export interface ArbExecutor {
  placeLeg(leg: ArbLeg, shares: number): Promise<Fill>;
}

/** Simulated fills at the detected prices — used for sim mode and dry runs. */
export class SimExecutor implements ArbExecutor {
  async placeLeg(leg: ArbLeg, shares: number): Promise<Fill> {
    return {
      filled: true,
      note: `sim fill ${shares} x "${leg.outcome}" @ ${leg.price} (cost $${(shares * leg.price).toFixed(2)})`,
    };
  }
}

export interface ClobCreds {
  key: string;
  secret: string;
  passphrase: string;
  funder: string;
  chainId: number;
}

/**
 * Real order placement through Polymarket's CLOB using @polymarket/clob-client.
 * Only used in live mode with --trade and valid credentials (API key, secret,
 * passphrase, funder wallet). The SDK is imported lazily so sim mode works
 * without it. This is best-effort: you should verify the fills yourself.
 */
export class ClobExecutor implements ArbExecutor {
  constructor(private readonly creds: ClobCreds) {}

  async placeLeg(leg: ArbLeg, shares: number): Promise<Fill> {
    if (!leg.tokenId) {
      throw new Error(`no tokenId for "${leg.outcome}" on ${leg.question}`);
    }
    const mod = await import('@polymarket/clob-client');
    const { ClobClient, Chain, SignatureType, Side } = mod;
    const client = new ClobClient(
      'https://clob.polymarket.com',
      this.creds.chainId as (typeof Chain)[keyof typeof Chain],
      undefined,
      {
        key: this.creds.key,
        secret: this.creds.secret,
        passphrase: this.creds.passphrase,
      },
      SignatureType.POLY_GNOSIS_SAFE,
      this.creds.funder,
    );
    const now = Math.floor(Date.now() / 1000);
    const response = await client.createAndPostOrder({
      tokenID: leg.tokenId,
      price: leg.price,
      size: shares,
      side: Side.BUY,
      feeRateBps: 0,
      nonce: now,
      expiration: now + 300,
    });
    return {
      filled: Boolean(response?.success),
      orderId: response?.orderID,
      note: `order for ${shares} x "${leg.outcome}" @ ${leg.price} → ${response?.status ?? 'unknown'}`,
    };
  }
}

/** Build an executor from the environment, or null when credentials are absent. */
export function createExecutor(): ArbExecutor | null {
  const key = process.env.POLYMARKET_API_KEY;
  const secret = process.env.POLYMARKET_API_SECRET;
  const passphrase = process.env.POLYMARKET_API_PASSPHRASE;
  const funder = process.env.POLYMARKET_FUNDER;
  if (key && secret && passphrase && funder) {
    const chainId = Number(process.env.POLYMARKET_CHAIN_ID ?? 137);
    return new ClobExecutor({ key, secret, passphrase, funder, chainId });
  }
  return null;
}

export async function placeOpportunity(
  executor: ArbExecutor,
  opportunity: Opportunity,
  shares: number,
): Promise<Fill[]> {
  const fills: Fill[] = [];
  for (const leg of opportunity.legs) {
    fills.push(await executor.placeLeg(leg, shares));
  }
  return fills;
}
