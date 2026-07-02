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
  /** Goaly contracts deployed + verified on Arbitrum One. Vault is goUSDT (ERC-20, migratable);
   *  pool supports odds-boosted parimutuel prizes. */
  goaly: {
    vault: '0xC5C51C530174857B7eCa715cFa275a0FBeaE0eb1', // goUSDT
    predictionPool: '0x28D56B2512e2e77AF1d49e5E2290ea2EB4918A99',
    composer: '0xDb839c7100531b331D54C0C2cA81C971ae4eF31A',
    deployBlock: 479692780,
  },
} as const;

/** The Morpho vault Goaly supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
