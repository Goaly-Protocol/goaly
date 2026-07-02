import { type Hex, type WalletClient, createWalletClient, http } from 'viem';
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
 * calls `PredictionPool.settleMarket`. Backed by viem. (Users sign with {@link WdkWallet} instead.)
 */
export class KeyWallet implements WalletProvider {
  readonly name = 'key';
  private readonly account: PrivateKeyAccount;
  private readonly client: WalletClient;
  private readonly chainId: string;

  constructor(privateKey: Hex, options: KeyWalletOptions = {}) {
    this.account = privateKeyToAccount(privateKey);
    this.client = createWalletClient({
      account: this.account,
      chain: arbitrum,
      transport: http(options.provider),
    });
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
    return this.client.sendTransaction({
      account: this.account,
      chain: arbitrum,
      to: params.to as Hex,
      value: params.amount,
    });
  }

  async sendTransaction(tx: TxRequest): Promise<string> {
    return this.client.sendTransaction({
      account: this.account,
      chain: arbitrum,
      to: tx.to as Hex,
      value: tx.value ?? 0n,
      ...(tx.data ? { data: tx.data as Hex } : {}),
    });
  }
}
