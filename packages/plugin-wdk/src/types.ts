/** A self-custodial wallet account — the user holds their own keys. */
export interface WalletAccount {
  address: string;
  /** CAIP-2-ish chain id, e.g. "eip155:42161" for Arbitrum One. */
  chain: string;
}

export interface SendParams {
  to: string;
  /** Token amount in base units (USDT0 = 6 decimals). */
  amount: bigint;
  /** ERC-20 token address; omit for the native asset. */
  token?: string;
}

/** A raw transaction request for contract calls (e.g. ERC-20 approve, vault deposit). */
export interface TxRequest {
  to: string;
  data?: string;
  value?: bigint;
}

/**
 * Abstraction over a self-custodial wallet. The MVP ships a deterministic mock; the production
 * implementation is backed by Tether's WDK (`@tetherto/wdk`) in the app, where keys stay on-device.
 */
export interface WalletProvider {
  readonly name: string;
  createWallet(): Promise<WalletAccount>;
  importWallet(mnemonic: string): Promise<WalletAccount>;
  getAccount(): WalletAccount | null;
  signMessage(message: string): Promise<string>;
  /** Sign + broadcast a transfer; returns the tx hash. */
  send(params: SendParams): Promise<string>;
  /** Sign + broadcast a raw contract call (e.g. ERC-20 approve, vault deposit); returns the tx hash. */
  sendTransaction(tx: TxRequest): Promise<string>;
}
