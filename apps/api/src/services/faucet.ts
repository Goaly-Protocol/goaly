import { createArbitrumClient } from '@goaly/plugin-onchain';
import { KeyWallet } from '@goaly/plugin-wdk';
import { gte, sql } from 'drizzle-orm';
import { parseEther } from 'viem';
import type { DB } from '../db/client';
import { faucetDrips } from '../db/schema';
import type { Env } from '../env';

/** Why a drip did not happen (200-level "not funded" outcomes, not errors). */
export type DripSkipReason =
  'faucet_disabled' | 'already_funded' | 'daily_cap' | 'already_has_gas' | 'send_failed';

export type DripResult =
  { funded: true; txHash: string } | { funded: false; reason: DripSkipReason };

export interface Faucet {
  /** Drip a little ETH to a fresh embedded account so it can pay for its first tx. */
  dripGas(address: string): Promise<DripResult>;
}

export interface FaucetDeps {
  db: DB;
  env: Env;
}

/** Start of the current UTC day, in ms since epoch (`Date.now()` is already UTC). */
function startOfUtcDay(nowMs: number): number {
  return nowMs - (nowMs % 86_400_000);
}

/**
 * Gas faucet — signs a tiny native-ETH transfer from a funded server wallet to a newly-created
 * user account on Arbitrum. Uses the WDK-backed {@link KeyWallet} to stay consistent with the
 * oracle / yield-agent signing path. Disabled (and inert) when `FAUCET_PK` is unset.
 */
export function createFaucet({ db, env }: FaucetDeps): Faucet {
  const pk = env.FAUCET_PK;
  const dripWei = parseEther(env.FAUCET_DRIP_ETH);
  const minBalanceWei = parseEther(env.FAUCET_MIN_BALANCE_ETH);
  const dailyCap = env.FAUCET_DAILY_CAP;

  // Built only when enabled — no wallet/RPC is constructed for a disabled faucet.
  const wallet = pk ? new KeyWallet(pk as `0x${string}`, { provider: env.ARBITRUM_RPC_URL }) : null;
  const client = pk ? createArbitrumClient(env.ARBITRUM_RPC_URL) : null;

  async function dripGas(rawAddress: string): Promise<DripResult> {
    const address = rawAddress.toLowerCase();

    // 1) Faucet not configured → graceful no-op.
    if (!wallet || !client) return { funded: false, reason: 'faucet_disabled' };

    // 2) One drip per address, ever — idempotent even before the tx confirms.
    const existing = db
      .select({ address: faucetDrips.address })
      .from(faucetDrips)
      .where(sql`${faucetDrips.address} = ${address}`)
      .get();
    if (existing) return { funded: false, reason: 'already_funded' };

    // 3) Daily anti-drain cap (per UTC day).
    const since = startOfUtcDay(Date.now());
    const today = db
      .select({ count: sql<number>`count(*)` })
      .from(faucetDrips)
      .where(gte(faucetDrips.drippedAt, since))
      .get();
    if ((today?.count ?? 0) >= dailyCap) return { funded: false, reason: 'daily_cap' };

    // 4) Skip accounts that can already pay for gas.
    const balance = await client.getBalance({ address: address as `0x${string}` });
    if (balance >= minBalanceWei) return { funded: false, reason: 'already_has_gas' };

    // 5) Send the drip; only record it once broadcast succeeds.
    let txHash: string;
    try {
      txHash = await wallet.send({ to: address, amount: dripWei });
    } catch (err) {
      console.error('[faucet] drip send failed', err);
      return { funded: false, reason: 'send_failed' };
    }

    db.insert(faucetDrips)
      .values({ address, txHash, amount: dripWei.toString(), drippedAt: Date.now() })
      .onConflictDoNothing()
      .run();

    return { funded: true, txHash };
  }

  return { dripGas };
}
