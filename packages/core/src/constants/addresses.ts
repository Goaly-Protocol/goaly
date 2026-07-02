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
  /** Morpho MetaMorpho (ERC-4626) USDT0 yield vaults. */
  morphoVaults: {
    gauntletUsdt0Core: '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec',
    steakhousePrimeUsdt0: '0x2281961480216653529A03D6CE03Ee6B8cdF564E',
  },
  /** TODO(verify): canonical USDT0 token address on Arbitrum before mainnet. */
  usdt0: '',
} as const;

/** The Morpho vault GoalYield supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
