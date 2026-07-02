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

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Goaly API',
    version: '0.1.0',
    description:
      'No-loss football prediction API. All stake/payout amounts are USDT0 base units (6 decimals) as decimal strings. Match data is served from a local cache filled by a credit-aware sync against The Odds API.',
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
        summary: 'Place a prediction (stakes borrowed credit, not principal)',
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
    '/positions/{address}': {
      get: {
        summary:
          'On-chain vault position for an address (principal, debt, remainingDebt, withdrawable)',
        parameters: [{ name: 'address', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Position' },
          '501': { description: 'GOALY_VAULT_ADDRESS not configured' },
        },
      },
    },
    '/admin/sync': {
      post: {
        summary: 'Run one credit-aware sync tick',
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
        summary: 'Settle the on-chain PredictionPool market from the finished match result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'On-chain settlement tx (matchId, marketId, result, txHash)' },
          '409': { description: 'No result yet' },
          '501': { description: 'ORACLE_PK not configured' },
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
  components: { schemas: { Match, Pick } },
};
