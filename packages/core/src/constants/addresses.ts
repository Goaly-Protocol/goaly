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
  /** Goaly contracts deployed + verified on Arbitrum One. Vault is goUSDT (ERC-20, migratable). */
  goaly: {
    vault: '0xD3Ec43F60E2AC1517c4DD80C0A23Ad8d902EAF0F', // goUSDT
    predictionPool: '0xfECc20bdaa28681Bada577731B8A24F415cBCa87',
    composer: '0xF83c270f5CA29eCa91454Cfd1F9653f619F5d579',
    deployBlock: 479616669,
  },
} as const;

/** The Morpho vault Goaly supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
