export const ARBITRUM_ONE = {
  id: 42161,
  name: 'Arbitrum One',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

export type ChainId = typeof ARBITRUM_ONE.id;
