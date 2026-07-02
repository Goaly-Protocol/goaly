import { createConfig } from 'ponder';
import { GoalyVaultAbi } from './abis/GoalyVault';

const vaultAddress = (process.env.GOALY_VAULT_ADDRESS ??
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export default createConfig({
  chains: {
    arbitrum: {
      id: 42161,
      rpc: process.env.PONDER_RPC_URL_42161 ?? 'https://arb1.arbitrum.io/rpc',
    },
  },
  contracts: {
    GoalyVault: {
      abi: GoalyVaultAbi,
      chain: 'arbitrum',
      address: vaultAddress,
      startBlock: Number(process.env.GOALY_VAULT_START_BLOCK ?? 0),
    },
  },
});
