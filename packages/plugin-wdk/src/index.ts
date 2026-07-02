export * from './types';
export { MockWallet } from './mock';

// Production implementation lives in the app (browser) using `@tetherto/wdk`, which keeps the
// user's keys on-device. It implements the `WalletProvider` interface exported here so the rest of
// the codebase is agnostic to how signing happens. See README for the WDK wiring.
