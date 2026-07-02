export * from './types';
export { MockWallet } from './mock';
export { WdkWallet, type WdkWalletOptions } from './wdk-wallet';

// `WdkWallet` is backed by Tether's WDK (`@tetherto/wdk-wallet-evm`); keys derive from a BIP-39
// seed and stay on-device. `MockWallet` is a deterministic in-memory stand-in for dev/tests.
