/**
 * OpenAPI 3.1 document for the Goaly API, served at `/openapi.json` and
 * rendered by Scalar at `/docs`.
 */

const Pick = {
  oneOf: [
    {
      type: 'object',
      required: ['market', 'outcome'],
      properties: {
        market: { const: 'WINNER' },
        outcome: { type: 'string', enum: ['HOME', 'DRAW', 'AWAY'] },
      },
    },
    {
      type: 'object',
      required: ['market', 'homeScore', 'awayScore'],
      properties: {
        market: { const: 'EXACT_SCORE' },
        homeScore: { type: 'integer', minimum: 0 },
        awayScore: { type: 'integer', minimum: 0 },
      },
    },
  ],
} as const;

const Match = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    sportKey: { type: 'string' },
    homeTeam: { type: 'string' },
    awayTeam: { type: 'string' },
    kickoff: { type: 'integer', description: 'Kickoff, unix seconds' },
    round: { type: 'string' },
    status: { type: 'string', enum: ['SCHEDULED', 'LOCKED', 'FINISHED', 'CANCELLED'] },
    homeScore: { type: ['integer', 'null'] },
    awayScore: { type: ['integer', 'null'] },
  },
} as const;

const LeaderboardEntry = {
  type: 'object',
  properties: {
    address: { type: 'string', description: 'Wallet address (lowercased hex)' },
    predictions: { type: 'integer', description: 'On-chain predictions placed' },
    totalStaked: { type: 'string', description: 'Total staked, base units' },
    wins: { type: 'integer', description: 'Settled positions claimed' },
    volume: { type: 'string', description: 'Total value transacted (staked + prizes), base units' },
  },
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Goaly API',
    version: '0.2.0',
    description:
      'No-loss football predictions on Arbitrum. Players stake stablecoins directly (USDT0 / USDC) and never lose principal; winners split a yield-funded, odds-boosted prize. Amounts are USDT0 base units (6 decimals) as decimal strings. Odds + fixtures come from the Goaly odds feed; an autonomous WDK agent rebalances the pool’s Morpho yield across chains and tokens.',
    'x-logo': { url: '/favicon.svg', altText: 'Goaly' },
  },
  servers: [{ url: '/' }],
  paths: {
    '/health': {
      get: { summary: 'Liveness probe', responses: { '200': { description: 'OK' } } },
    },
    '/matches': {
      get: {
        summary: 'List cached matches',
        responses: {
          '200': {
            description: 'Matches',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { matches: { type: 'array', items: Match } },
                },
              },
            },
          },
        },
      },
    },
    '/matches/{id}': {
      get: {
        summary: 'Get a match',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Match' }, '404': { description: 'Not found' } },
      },
    },
    '/predictions': {
      get: {
        summary: "List a user's predictions",
        parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Predictions' } },
      },
      post: {
        summary: 'Record a prediction (off-chain mirror of the on-chain stake)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'matchId', 'pick', 'stake'],
                properties: {
                  userId: { type: 'string' },
                  matchId: { type: 'string' },
                  pick: Pick,
                  stake: { type: 'string', description: 'USDT0 base units', example: '10000000' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '409': { description: 'Predictions closed' },
        },
      },
    },
    '/leaderboard': {
      get: {
        summary: 'Top stakers, from the on-chain indexer (base-unit strings, counts as numbers)',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        ],
        responses: {
          '200': {
            description:
              'Leaderboard (empty array if the indexer is unreachable). Ordered by totalStaked desc.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { leaderboard: { type: 'array', items: LeaderboardEntry } },
                },
              },
            },
          },
        },
      },
    },
    '/markets': {
      get: {
        summary: 'On-chain markets from the indexer (open + settled)',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Markets (empty array if the indexer is unreachable).',
          },
        },
      },
    },
    '/admin/sync': {
      post: {
        summary: 'Run one sync tick (fixtures + odds + on-chain markets)',
        responses: { '200': { description: 'Sync counts' } },
      },
    },
    '/admin/matches/{id}/result': {
      post: {
        summary: 'Record a final result (admin oracle)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['homeScore', 'awayScore'],
                properties: {
                  homeScore: { type: 'integer', minimum: 0 },
                  awayScore: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
    '/admin/matches/{id}/settle': {
      post: {
        summary: 'Settle a finished match and compute pot payouts',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Settlement summary' },
          '409': { description: 'No result yet' },
        },
      },
    },
    '/admin/matches/{id}/settle-onchain': {
      post: {
        summary: 'Settle the on-chain GoalyPool market from the finished match result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'On-chain settlement tx (matchId, marketId, result, txHash)' },
          '409': { description: 'No result yet' },
          '501': { description: 'ORACLE_PK not configured' },
        },
      },
    },
    '/admin/reconcile': {
      post: {
        summary: 'Run one settlement reconcile pass (self-healing settle retry net)',
        responses: {
          '200': {
            description: 'Reconcile summary (onchainSettled, offchainSettled, skipped, errors)',
          },
        },
      },
    },
    '/admin/usage': {
      get: {
        summary: 'Odds API credit usage + estimated remaining',
        responses: { '200': { description: 'Usage' } },
      },
    },
  },
  components: { schemas: { Match, Pick, LeaderboardEntry } },
};
