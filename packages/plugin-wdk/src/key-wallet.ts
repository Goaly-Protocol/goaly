import {
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import type { SendParams, TxRequest, WalletAccount, WalletProvider } from './types';

export interface KeyWalletOptions {
  /** EVM RPC URL (required to broadcast; not needed for address derivation / signing). */
  provider?: string;
  /** CAIP-2 chain label recorded on the account (default Arbitrum One). */
  chain?: string;
}

/**
 * A private-key {@link WalletProvider} for server-side signing — e.g. the settlement oracle that
 * calls `PredictionPool.createMarket`/`settleMarket`. Backed by viem. (Users sign with
 * {@link WdkWallet} instead.)
 *
 * Sends are **serialized with a locally-tracked nonce** so a burst of txs (e.g. opening a market
 * per fixture during a sync) doesn't race the RPC's pending-nonce count. The nonce resyncs from
 * chain on the next send after any failure.
 */
export class KeyWallet implements WalletProvider {
  readonly name = 'key';
  private readonly account: PrivateKeyAccount;
  private readonly client: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly chainId: string;

  private nonce: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(privateKey: Hex, options: KeyWalletOptions = {}) {
    this.account = privateKeyToAccount(privateKey);
    this.client = createWalletClient({
      account: this.account,
      chain: arbitrum,
      transport: http(options.provider),
    });
    this.publicClient = createPublicClient({ chain: arbitrum, transport: http(options.provider) });
    this.chainId = options.chain ?? 'eip155:42161';
  }

  async createWallet(): Promise<WalletAccount> {
    return this.currentAccount();
  }

  async importWallet(): Promise<WalletAccount> {
    return this.currentAccount();
  }

  getAccount(): WalletAccount | null {
    return this.currentAccount();
  }

  private currentAccount(): WalletAccount {
    return { address: this.account.address, chain: this.chainId };
  }

  async signMessage(message: string): Promise<string> {
    return this.account.signMessage({ message });
  }

  async send(params: SendParams): Promise<string> {
    if (params.token) {
      throw new Error(
        'KeyWallet.send: token transfers require encoded calldata — use sendTransaction',
      );
    }
    return this.enqueue({ to: params.to, value: params.amount });
  }

  async sendTransaction(tx: TxRequest): Promise<string> {
    return this.enqueue(tx);
  }

  /** Serialize sends so nonces stay strictly increasing under bursts. */
  private enqueue(tx: TxRequest): Promise<string> {
    const task = this.queue.then(() => this.broadcast(tx));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async broadcast(tx: TxRequest): Promise<string> {
    if (this.nonce === null) {
      this.nonce = await this.publicClient.getTransactionCount({
        address: this.account.address,
        blockTag: 'pending',
      });
    }
    try {
      const hash = await this.client.sendTransaction({
        account: this.account,
        chain: arbitrum,
        to: tx.to as Hex,
        value: tx.value ?? 0n,
        nonce: this.nonce,
        ...(tx.data ? { data: tx.data as Hex } : {}),
      });
      this.nonce += 1;
      return hash;
    } catch (error) {
      this.nonce = null; // resync from chain on the next send
      throw error;
    }
  }
}
