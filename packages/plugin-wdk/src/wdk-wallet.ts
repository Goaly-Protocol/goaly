import WalletManagerEvm, { type WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import type { SendParams, WalletAccount, WalletProvider } from './types';

export interface WdkWalletOptions {
  /** EVM RPC URL. Not needed for offline address derivation / signing. */
  provider?: string;
  /** CAIP-2 chain label recorded on the account (default Arbitrum One). */
  chain?: string;
  /** BIP-44 account index (default 0 → m/44'/60'/0'/0/0). */
  accountIndex?: number;
}

/**
 * Self-custodial wallet backed by Tether's WDK (`@tetherto/wdk-wallet-evm`). Keys are derived from
 * a BIP-39 seed and never leave the process; address derivation and message signing are offline.
 * This is the production `WalletProvider` implementation (the app supplies the seed from secure
 * on-device storage).
 */
export class WdkWallet implements WalletProvider {
  readonly name = 'wdk-evm';
  private manager: WalletManagerEvm;
  private account: WalletAccountEvm | null = null;
  private address: string | null = null;
  private readonly chainId: string;
  private readonly index: number;
  private readonly provider: string | undefined;

  constructor(seedPhrase: string, options: WdkWalletOptions = {}) {
    this.provider = options.provider;
    this.chainId = options.chain ?? 'eip155:42161';
    this.index = options.accountIndex ?? 0;
    this.manager = new WalletManagerEvm(seedPhrase, this.config());
  }

  private config() {
    return this.provider ? { provider: this.provider } : {};
  }

  private async load(): Promise<WalletAccount> {
    this.account = await this.manager.getAccount(this.index);
    this.address = await this.account.getAddress();
    return { address: this.address, chain: this.chainId };
  }

  /** Derive the account from the configured seed. */
  async createWallet(): Promise<WalletAccount> {
    return this.load();
  }

  /** Re-seed from a BIP-39 mnemonic and derive the account. */
  async importWallet(mnemonic: string): Promise<WalletAccount> {
    this.manager = new WalletManagerEvm(mnemonic, this.config());
    return this.load();
  }

  getAccount(): WalletAccount | null {
    return this.address ? { address: this.address, chain: this.chainId } : null;
  }

  async signMessage(message: string): Promise<string> {
    const account = await this.requireAccount();
    return account.sign(message);
  }

  async send(params: SendParams): Promise<string> {
    const account = await this.requireAccount();
    if (params.token) {
      const { hash } = await account.transfer({
        token: params.token,
        recipient: params.to,
        amount: params.amount,
      });
      return hash;
    }
    const { hash } = await account.sendTransaction({ to: params.to, value: params.amount });
    return hash;
  }

  private async requireAccount(): Promise<WalletAccountEvm> {
    if (!this.account) await this.load();
    if (!this.account) throw new Error('WdkWallet: account not initialized');
    return this.account;
  }
}
