import { createConfig } from 'ponder';
import { GoalyMarketsAbi } from './abis/GoalyMarkets';

const marketsAddress = (process.env.GOALY_MARKETS_ADDRESS ??
  '0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3') as `0x${string}`;

export default createConfig({
  chains: {
    arbitrum: {
      id: 42161,
      rpc: process.env.PONDER_RPC_URL_42161 ?? 'https://arb1.arbitrum.io/rpc',
    },
  },
  contracts: {
    GoalyMarkets: {
      abi: GoalyMarketsAbi,
      chain: 'arbitrum',
      address: marketsAddress,
      startBlock: Number(process.env.GOALY_MARKETS_START_BLOCK ?? 480301271),
    },
  },
});
