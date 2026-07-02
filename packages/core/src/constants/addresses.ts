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
  /** Morpho MetaMorpho (ERC-4626) USDT0 yield vaults. */
  morphoVaults: {
    gauntletUsdt0Core: '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec',
    steakhousePrimeUsdt0: '0x2281961480216653529A03D6CE03Ee6B8cdF564E',
  },
  /** LayerZero V2 EndpointV2. */
  lzEndpoint: '0x1a44076050125825900e736c501f859c50fE728c',
  /** Goaly contracts deployed + verified on Arbitrum One. */
  goaly: {
    vault: '0x30042f0225fc513ba22551afcd8d3a88d3e128d1',
    predictionPool: '0x9d77f5e1d5afe5258ca16f808dc5ba1e9f68437f',
    composer: '0x2fff7ca8686cfa6387b4958ea70b2fae0285d56a',
    deployBlock: 479593944,
  },
} as const;

/** The Morpho vault Goaly supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
