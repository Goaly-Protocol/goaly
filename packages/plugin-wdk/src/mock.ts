import type { SendParams, WalletAccount, WalletProvider } from './types';

/** Deterministic in-memory wallet for local dev and tests (no real keys, no network). */
export class MockWallet implements WalletProvider {
  readonly name = 'mock';
  private account: WalletAccount | null = null;
  private txCounter = 0;
  private walletCounter = 0;

  constructor(private readonly chain = 'eip155:42161') {}

  private deterministicAddress(seed: string): string {
    // Cheap deterministic 20-byte hex from the seed (dev only — NOT a real key derivation).
    let hash = 0n;
    for (const ch of seed) hash = (hash * 31n + BigInt(ch.charCodeAt(0))) % (1n << 160n);
    return `0x${hash.toString(16).padStart(40, '0')}`;
  }

  async createWallet(): Promise<WalletAccount> {
    this.walletCounter += 1;
    this.account = {
      address: this.deterministicAddress(`wallet:${this.walletCounter}`),
      chain: this.chain,
    };
    return this.account;
  }

  async importWallet(mnemonic: string): Promise<WalletAccount> {
    this.account = { address: this.deterministicAddress(mnemonic), chain: this.chain };
    return this.account;
  }

  getAccount(): WalletAccount | null {
    return this.account;
  }

  async signMessage(message: string): Promise<string> {
    if (!this.account) throw new Error('MockWallet: no account');
    return `0xsig:${this.deterministicAddress(message)}`;
  }

  async send(_params: SendParams): Promise<string> {
    if (!this.account) throw new Error('MockWallet: no account');
    this.txCounter += 1;
    return `0x${this.txCounter.toString(16).padStart(64, '0')}`;
  }
}
