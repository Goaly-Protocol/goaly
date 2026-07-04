import { ARBITRUM_ONE } from './chains';

/**
 * On-chain addresses on Arbitrum One (42161).
 *
 * The Morpho MetaMorpho USDT0 vaults are ERC-4626 vaults we supply USDT0 into to
 * earn yield. Addresses taken from the Morpho app; verify on-chain before mainnet.
 * The canonical USDT0 token address must be confirmed before mainnet use.
 */
export const ARBITRUM = {
  chainId: ARBITRUM_ONE.id,
  /** Canonical USDT0 token on Arbitrum One. */
  usdt0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  /** Morpho MetaMorpho (ERC-4626) yield vaults the agent can migrate between. Same-chain moves are
   *  executable directly — the vault swaps USDT0 ↔ the vault's asset on-chain, so USDC vaults count. */
  morphoVaults: {
    gauntletUsdt0Core: '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec',
    steakhousePrimeUsdt0: '0x2281961480216653529A03D6CE03Ee6B8cdF564E',
    steakhouseHighYieldUsdt0: '0x4739E2c293bDCD835829aA7c5d7fBdee93565D1a',
    gauntletUsdcCore: '0x7e97fa6893871A2751B5fE961978DCCb2c201E65',
    steakhouseHighYieldUsdc: '0x5c0C306Aaa9F877de636f4d5822cA9F2E81563BA',
  },
  /** Goaly protocol on Arbitrum One — a layered no-loss system:
   *  - markets:    prediction layer (predict / claim / settle), deposits stakes into the vault
   *  - vault:      ERC-4626 yield vault the agent allocates across strategies
   *  - settlement: optimistic settlement oracle (bonded propose → dispute window → finalize) */
  goaly: {
    markets: '0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3',
    vault: '0xFe424b5b85C742C15CCB09d62873bE72577CD7Ef',
    settlement: '0xC03BB9526D6F0308d8Ba0831e85f93db3E45e201',
    deployBlock: 480301271,
  },
} as const;

/** The Morpho vault Goaly supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
