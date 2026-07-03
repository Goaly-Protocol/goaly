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
  /** LayerZero V2 EndpointV2. */
  lzEndpoint: '0x1a44076050125825900e736c501f859c50fE728c',
  /** Goaly contracts deployed + verified on Arbitrum One. Vault is goUSDT (ERC-20, migratable);
   *  pool supports odds-boosted parimutuel prizes. */
  goaly: {
    vault: '0x2Be9565CfaFDaE2c06cF3980c872d7D49E745Ba8', // goUSDT
    predictionPool: '0x4d18DcE850C665c739b48EC372A8AfB872e5d6C8',
    wormholeReceiver: '0xF5C6d07442D8992901cf263501EFA11d69743d5c',
    deployBlock: 479692780,
  },
} as const;

/** The Morpho vault Goaly supplies into by default. */
export const DEFAULT_YIELD_VAULT = ARBITRUM.morphoVaults.gauntletUsdt0Core;
