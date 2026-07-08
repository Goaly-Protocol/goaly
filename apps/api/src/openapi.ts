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
    round: { type: 'string', description: 'GROUP, R32, R16, QF, SF, F, …' },
    status: { type: 'string', enum: ['SCHEDULED', 'LOCKED', 'FINISHED', 'CANCELLED'] },
    homeScore: { type: ['integer', 'null'] },
    awayScore: { type: ['integer', 'null'] },
    closingHomeBps: {
      type: ['integer', 'null'],
      description: 'Closing home-win odds ×10 000 (bps), frozen at kickoff; null until frozen',
    },
    closingDrawBps: { type: ['integer', 'null'], description: 'Closing draw odds ×10 000 (bps)' },
    closingAwayBps: {
      type: ['integer', 'null'],
      description: 'Closing away-win odds ×10 000 (bps)',
    },
    updatedAt: { type: 'integer', description: 'Last update, unix milliseconds' },
  },
} as const;

const TeamMeta = {
  type: 'object',
  description: 'Resolved team metadata (national flag or club crest). Null when unresolved.',
  properties: {
    name: { type: 'string' },
    code: { type: 'string', description: 'FIFA 3-letter code, e.g. "ARG"' },
    iso: { type: 'string', description: 'flagcdn ISO key, e.g. "ar" or "gb-eng" ("" for clubs)' },
    logo: { type: 'string', description: 'Flag / badge image URL' },
  },
} as const;

const Odds = {
  type: 'object',
  description: 'Average h2h decimal odds (e.g. 1.30 = favourite). Live cache, else frozen closing.',
  properties: {
    home: { type: 'number' },
    draw: { type: 'number' },
    away: { type: 'number' },
  },
} as const;

/** A match row enriched with resolved team metadata (as returned by GET /matches/all). */
const MatchWithMeta = {
  allOf: [
    Match,
    {
      type: 'object',
      properties: {
        homeTeamMeta: { anyOf: [TeamMeta, { type: 'null' }] },
        awayTeamMeta: { anyOf: [TeamMeta, { type: 'null' }] },
      },
    },
  ],
} as const;

/** A match with team metadata AND current odds (GET /matches, GET /matches/{id}). */
const MatchDetail = {
  allOf: [
    MatchWithMeta,
    {
      type: 'object',
      properties: { odds: { anyOf: [Odds, { type: 'null' }] } },
    },
  ],
} as const;

const Prediction = {
  type: 'object',
  description: 'Off-chain mirror of an on-chain stake. `stake`/`payout` are USDT0 base units.',
  properties: {
    id: { type: 'string', description: 'Predict tx hash (lowercased) when on-chain, else a UUID' },
    userId: { type: 'string', description: 'Wallet address' },
    matchId: { type: 'string' },
    market: { type: 'string', enum: ['WINNER', 'EXACT_SCORE'] },
    pick: { type: 'string', description: 'JSON-encoded Pick object' },
    stake: { type: 'string', description: 'USDT0 base units', example: '10000000' },
    createdAt: { type: 'integer', description: 'unix milliseconds' },
    settled: { type: 'boolean' },
    won: { type: ['boolean', 'null'] },
    payout: { type: ['string', 'null'], description: 'USDT0 base units (once settled)' },
    match: { anyOf: [MatchWithMeta, { type: 'null' }] },
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

/** On-chain market lifecycle row from the Ponder indexer. */
const Market = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'marketId = keccak256(matchId)' },
    status: { type: 'string', description: 'e.g. OPEN | SETTLED' },
    closeTime: { type: 'string', description: 'unix seconds (string)' },
    result: {
      type: ['integer', 'null'],
      description: '0 HOME / 1 DRAW / 2 AWAY, null until settled',
    },
    resultLabel: { type: ['string', 'null'], enum: ['HOME', 'DRAW', 'AWAY', null] },
    winningStake: { type: ['string', 'null'], description: 'base units' },
    prize: { type: ['string', 'null'], description: 'yield-funded prize, base units' },
    createdBlock: { type: 'string' },
    settledBlock: { type: ['string', 'null'] },
    updatedTimestamp: { type: 'string' },
  },
} as const;

const StandingRow = {
  type: 'object',
  properties: {
    team: { type: 'string' },
    played: { type: 'integer' },
    won: { type: 'integer' },
    drawn: { type: 'integer' },
    lost: { type: 'integer' },
    gf: { type: 'integer', description: 'Goals for' },
    ga: { type: 'integer', description: 'Goals against' },
    gd: { type: 'integer', description: 'Goal difference' },
    points: { type: 'integer' },
    teamMeta: { anyOf: [TeamMeta, { type: 'null' }] },
  },
} as const;

const StandingGroup = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', description: 'e.g. "Group A"' },
    rows: { type: 'array', items: StandingRow, description: 'Ranked by points → GD → GF → name' },
  },
} as const;

const BracketMatch = {
  type: 'object',
  properties: {
    home: { type: 'string', description: 'Team name ("" when the slot is still TBD)' },
    away: { type: 'string' },
    homeScore: { type: ['integer', 'null'] },
    awayScore: { type: ['integer', 'null'] },
    homePens: { type: ['integer', 'null'], description: 'Penalty-shootout score' },
    awayPens: { type: ['integer', 'null'] },
    homeMeta: { anyOf: [TeamMeta, { type: 'null' }] },
    awayMeta: { anyOf: [TeamMeta, { type: 'null' }] },
  },
} as const;

const BracketRound = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', description: 'e.g. "Round of 16", "Final"' },
    matches: { type: 'array', items: BracketMatch },
  },
} as const;

/** A yield vault's live economics (Morpho MetaMorpho snapshot). */
const VaultSnapshot = {
  type: 'object',
  properties: {
    address: { type: 'string' },
    name: { type: 'string' },
    apy: { type: 'number', description: 'Fraction (0.0172 = 1.72%)' },
    tvlUsd: { type: 'number' },
    chainId: { type: 'integer' },
    chain: { type: 'string' },
    asset: { type: 'string', description: 'Underlying symbol, e.g. "USDT0", "USDC"' },
  },
} as const;

const RebalanceDecision = {
  type: 'object',
  properties: {
    shouldRebalance: { type: 'boolean' },
    from: { anyOf: [VaultSnapshot, { type: 'null' }] },
    to: {
      anyOf: [VaultSnapshot, { type: 'null' }],
      description: 'Best directly-migratable vault (same chain as current backing)',
    },
    globalBest: {
      anyOf: [VaultSnapshot, { type: 'null' }],
      description: 'Highest-APY vault anywhere — may be cross-chain / cross-token',
    },
    crossVenue: { type: 'boolean', description: 'True when globalBest is on another chain/asset' },
    gainBps: { type: 'number' },
    reason: { type: 'string' },
  },
} as const;

const AgentStatus = {
  type: 'object',
  description: 'Yield-agent status. Advisory only — decisions are surfaced, not auto-executed.',
  properties: {
    enabled: { type: 'boolean', description: 'False (and nothing else) when the agent is off' },
    vault: { type: 'string', description: 'GoalyVault address the agent manages' },
    currentVault: {
      type: ['string', 'null'],
      description: 'Address of the vault currently backing',
    },
    current: { anyOf: [VaultSnapshot, { type: 'null' }] },
    candidates: { type: 'array', items: VaultSnapshot, description: 'Ranked by APY desc' },
    decision: { anyOf: [RebalanceDecision, { type: 'null' }] },
    route: {
      type: ['object', 'null'],
      description: 'Wormhole bridge/swap route to the best cross-chain vault, when applicable',
    },
    ai: {
      type: ['object', 'null'],
      description: 'Optional LLM rationale layer',
      properties: {
        reason: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
    lastRunAt: { type: ['integer', 'null'], description: 'unix milliseconds' },
    lastTxHash: { type: ['string', 'null'] },
    autoExecute: { type: 'boolean' },
    canExecute: { type: 'boolean', description: 'True when an agent wallet is configured' },
  },
} as const;

const Notification = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: {
      type: 'string',
      description: 'welcome | placed | won | settled | claimed | deposited | kickoff',
    },
    title: { type: 'string' },
    body: { type: 'string' },
    url: { type: 'string', description: 'In-app path opened when tapped' },
    createdAt: { type: 'integer', description: 'unix milliseconds' },
    readAt: { type: ['integer', 'null'], description: 'unix milliseconds; null = unread' },
  },
} as const;

const TermsAcceptance = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '`${address}-${version}`' },
    address: { type: 'string', description: 'Wallet address (lowercased)' },
    version: { type: 'string' },
    signature: { type: 'string', description: 'EIP-712 signature (hex)' },
    acceptedAt: { type: 'integer', description: 'unix milliseconds' },
  },
} as const;

const Ok = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Goaly API',
    version: '0.3.0',
    description:
      'No-loss football predictions on Arbitrum One. Players stake stablecoins directly (USDT0) and ' +
      'never lose principal; winners split a yield-funded, odds-boosted prize funded by the Morpho ' +
      'yield the pooled stakes earn. Amounts are USDT0 base units (6 decimals) as decimal strings. ' +
      'Fixtures + odds come from the Goaly feed; an autonomous WDK yield agent watches the Morpho ' +
      'landscape and recommends the best risk-adjusted vault for the protocol backing.\n\n' +
      'On-chain (Arbitrum One, chainId 42161): USDT0 `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`, ' +
      'GoalyMarkets `0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3`.',
    'x-logo': { url: '/favicon.svg', altText: 'Goaly' },
    'x-contracts': {
      chain: 'Arbitrum One',
      chainId: 42161,
      usdt0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      goalyMarkets: '0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3',
    },
  },
  servers: [
    { url: '/', description: 'Same-origin (the app proxies /api → the API)' },
    { url: 'https://api.goaly.fun', description: 'Production' },
  ],
  tags: [
    { name: 'System', description: 'Liveness + service index' },
    { name: 'Matches', description: 'Cached fixtures, odds, and team metadata' },
    { name: 'Predictions', description: 'Off-chain mirror of on-chain stakes' },
    { name: 'Markets', description: 'On-chain markets, leaderboard, and claims (Ponder indexer)' },
    { name: 'Standings', description: 'FIFA World Cup 2026 group tables + knockout bracket' },
    { name: 'Yield Agent', description: 'Autonomous Morpho yield rebalancing (WDK agent)' },
    { name: 'Terms', description: 'Signed Terms & Conditions acceptances' },
    { name: 'Faucet', description: 'Gas faucet for freshly-created embedded accounts' },
    { name: 'Notifications', description: 'Web Push (VAPID) + in-app inbox' },
    { name: 'Admin', description: 'Operator-only: sync, oracle results, settlement, usage' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'Service index (name, status, endpoints)',
        responses: { '200': { description: 'Status JSON' } },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness probe',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    provider: { type: 'string', enum: ['ready', 'none'] },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/matches': {
      get: {
        tags: ['Matches'],
        summary:
          'List bettable matches (SCHEDULED + within the live window, with odds + team meta)',
        responses: {
          '200': {
            description: 'Matches',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { matches: { type: 'array', items: MatchDetail } },
                },
              },
            },
          },
        },
      },
    },
    '/matches/all': {
      get: {
        tags: ['Matches'],
        summary: 'List all matches incl. finished (team meta, no odds) — newest kickoff first',
        description:
          'Lets tooling map an on-chain marketId → its fixture (marketId = keccak256(matchId) is not reversible).',
        responses: {
          '200': {
            description: 'Matches',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { matches: { type: 'array', items: MatchWithMeta } },
                },
              },
            },
          },
        },
      },
    },
    '/matches/{id}': {
      get: {
        tags: ['Matches'],
        summary: 'Get a match (with team meta + odds)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Match',
            content: { 'application/json': { schema: MatchDetail } },
          },
          '404': { description: 'Not found' },
        },
      },
    },
    '/predictions': {
      get: {
        tags: ['Predictions'],
        summary: "List a user's predictions (each enriched with its match)",
        parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Predictions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { predictions: { type: 'array', items: Prediction } },
                },
              },
            },
          },
          '400': { description: 'userId query param required' },
        },
      },
      post: {
        tags: ['Predictions'],
        summary: 'Record a prediction (off-chain mirror of the on-chain stake)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'matchId', 'pick', 'stake'],
                properties: {
                  userId: { type: 'string', description: 'Wallet address' },
                  matchId: { type: 'string' },
                  pick: Pick,
                  stake: { type: 'string', description: 'USDT0 base units', example: '10000000' },
                  txHash: {
                    type: 'string',
                    pattern: '^0x[0-9a-f]{64}$',
                    description:
                      'On-chain predict tx hash — used as the row id so this record dedupes with the indexed Predicted event',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
          },
          '400': { description: 'Invalid body / stake must be positive' },
          '404': { description: 'Match not found' },
          '409': { description: 'Predictions closed for this match' },
        },
      },
    },
    '/leaderboard': {
      get: {
        tags: ['Markets'],
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
        tags: ['Markets'],
        summary: 'On-chain markets from the indexer (open + settled), newest update first',
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { markets: { type: 'array', items: Market } },
                },
              },
            },
          },
        },
      },
    },
    '/claims': {
      get: {
        tags: ['Markets'],
        summary: 'Market ids a user has claimed on-chain (authoritative claim status)',
        parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Claimed market ids (empty array if the indexer is unreachable).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { marketIds: { type: 'array', items: { type: 'string' } } },
                },
              },
            },
          },
          '400': { description: 'userId query param required' },
        },
      },
    },
    '/standings': {
      get: {
        tags: ['Standings'],
        summary: 'FIFA World Cup 2026 group tables (cached from the FIFA data API)',
        responses: {
          '200': {
            description: 'Group standings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { groups: { type: 'array', items: StandingGroup } },
                },
              },
            },
          },
        },
      },
    },
    '/bracket': {
      get: {
        tags: ['Standings'],
        summary: 'Knockout bracket (Round of 32 → Final), rounds with fixtures only',
        responses: {
          '200': {
            description: 'Bracket rounds',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { rounds: { type: 'array', items: BracketRound } },
                },
              },
            },
          },
        },
      },
    },
    '/bracket/viewer': {
      get: {
        tags: ['Standings'],
        summary: 'The same bracket in the brackets-viewer.js data model (for its renderer)',
        responses: {
          '200': {
            description: 'brackets-viewer.js dataset (stage/group/round/match/participant arrays)',
          },
        },
      },
    },
    '/agent': {
      get: {
        tags: ['Yield Agent'],
        summary: 'Yield-agent status (runs a fresh read-only decision on first call)',
        responses: {
          '200': {
            description: 'Agent status (`{ enabled: false }` when the agent is not configured)',
            content: { 'application/json': { schema: AgentStatus } },
          },
        },
      },
    },
    '/agent/run': {
      post: {
        tags: ['Yield Agent'],
        summary: 'Refresh the rebalance decision (read-only, no on-chain execution)',
        responses: {
          '200': {
            description: 'Refreshed status',
            content: { 'application/json': { schema: AgentStatus } },
          },
          '501': { description: 'Yield agent not configured' },
        },
      },
    },
    '/agent/rebalance': {
      post: {
        tags: ['Yield Agent'],
        summary: 'Decide + execute the migration on-chain (requires an agent wallet)',
        responses: {
          '200': {
            description: 'Status after the (attempted) migration',
            content: { 'application/json': { schema: AgentStatus } },
          },
          '501': { description: 'Yield agent / agent wallet not configured' },
        },
      },
    },
    '/terms/accept': {
      post: {
        tags: ['Terms'],
        summary: 'Record a signed Terms & Conditions acceptance (idempotent per address+version)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address', 'version', 'signature'],
                properties: {
                  address: {
                    type: 'string',
                    pattern: '^0x[0-9a-f]{40}$',
                    description: '20-byte hex',
                  },
                  version: { type: 'string' },
                  signature: {
                    type: 'string',
                    pattern: '^0x[0-9a-f]+$',
                    description: 'EIP-712 signature',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Accepted', content: { 'application/json': { schema: Ok } } },
        },
      },
    },
    '/terms/{address}': {
      get: {
        tags: ['Terms'],
        summary: "A wallet's recorded Terms acceptances",
        parameters: [{ name: 'address', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Acceptances',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { acceptances: { type: 'array', items: TermsAcceptance } },
                },
              },
            },
          },
        },
      },
    },
    '/faucet/gas': {
      post: {
        tags: ['Faucet'],
        summary: 'Drip a little gas (native ETH) to a fresh embedded account',
        description:
          'Guardrailed (disabled / idempotent / daily-cap / already-funded). Always returns 200 with the outcome.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address'],
                properties: {
                  address: {
                    type: 'string',
                    pattern: '^0x[0-9a-f]{40}$',
                    description: '20-byte hex',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Drip outcome',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['funded', 'txHash'],
                      properties: { funded: { const: true }, txHash: { type: 'string' } },
                    },
                    {
                      type: 'object',
                      required: ['funded', 'reason'],
                      properties: {
                        funded: { const: false },
                        reason: {
                          type: 'string',
                          enum: [
                            'faucet_disabled',
                            'already_funded',
                            'daily_cap',
                            'already_has_gas',
                            'send_failed',
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/notifications/vapid-key': {
      get: {
        tags: ['Notifications'],
        summary: 'VAPID public key the browser needs to subscribe (null when push is disabled)',
        responses: {
          '200': {
            description: 'Public key',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { key: { type: ['string', 'null'] } } },
              },
            },
          },
        },
      },
    },
    '/notifications/subscribe': {
      post: {
        tags: ['Notifications'],
        summary: 'Register (or refresh) a browser push subscription for a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'subscription'],
                properties: {
                  userId: { type: 'string' },
                  subscription: {
                    type: 'object',
                    required: ['endpoint', 'keys'],
                    properties: {
                      endpoint: { type: 'string' },
                      keys: {
                        type: 'object',
                        required: ['p256dh', 'auth'],
                        properties: { p256dh: { type: 'string' }, auth: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Subscribed (`{ ok: false, disabled: true }` when push is not configured)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' }, disabled: { type: 'boolean' } },
                },
              },
            },
          },
        },
      },
    },
    '/notifications/unsubscribe': {
      post: {
        tags: ['Notifications'],
        summary: 'Remove a push subscription by its endpoint',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['endpoint'],
                properties: { endpoint: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: Ok } } },
        },
      },
    },
    '/notifications/claimed': {
      post: {
        tags: ['Notifications'],
        summary:
          'Notify hook: a claim tx confirmed (client-triggered — the server cannot observe it)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'amount'],
                properties: {
                  userId: { type: 'string' },
                  amount: { type: 'string', description: 'USDT display amount, e.g. "12.50"' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: Ok } } },
        },
      },
    },
    '/notifications/deposited': {
      post: {
        tags: ['Notifications'],
        summary: 'Notify hook: a deposit landed (client-triggered)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'amount'],
                properties: {
                  userId: { type: 'string' },
                  amount: { type: 'string', description: 'USDT display amount' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: Ok } } },
        },
      },
    },
    '/notifications/list': {
      get: {
        tags: ['Notifications'],
        summary: "A user's in-app inbox, newest first (works even without VAPID keys)",
        parameters: [
          { name: 'userId', in: 'query', required: true, schema: { type: 'string' } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
          },
        ],
        responses: {
          '200': {
            description: 'Inbox rows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { notifications: { type: 'array', items: Notification } },
                },
              },
            },
          },
          '400': { description: 'userId query param required' },
        },
      },
    },
    '/notifications/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark inbox rows read (all unread when `ids` omitted, else only those ids)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId'],
                properties: {
                  userId: { type: 'string' },
                  ids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'How many rows were updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' }, updated: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/notifications/unread': {
      get: {
        tags: ['Notifications'],
        summary: 'Unread badge count for a user',
        parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Unread count',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { count: { type: 'integer' } } },
              },
            },
          },
          '400': { description: 'userId query param required' },
        },
      },
    },
    '/admin/sync': {
      post: {
        tags: ['Admin'],
        summary: 'Run one sync tick (fixtures + odds + on-chain markets)',
        responses: { '200': { description: 'Sync counts' } },
      },
    },
    '/admin/matches/{id}/result': {
      post: {
        tags: ['Admin'],
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
        tags: ['Admin'],
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
        tags: ['Admin'],
        summary: 'Settle the on-chain GoalyMarkets market from the finished match result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description:
              'On-chain settlement tx (matchId, marketId, result, winningOddsBps, txHash)',
          },
          '404': { description: 'Match not found' },
          '409': { description: 'No result yet' },
          '501': { description: 'ORACLE_PK not configured' },
        },
      },
    },
    '/admin/reconcile': {
      post: {
        tags: ['Admin'],
        summary: 'Run one settlement reconcile pass (self-healing settle retry net)',
        responses: {
          '200': {
            description:
              'Reconcile summary (onchainSettled, offchainSettled, skipped, estimated, errors)',
          },
        },
      },
    },
    '/admin/usage': {
      get: {
        tags: ['Admin'],
        summary: 'Odds API credit usage + estimated remaining',
        responses: { '200': { description: 'Usage' } },
      },
    },
  },
  components: {
    schemas: {
      Match,
      MatchWithMeta,
      MatchDetail,
      TeamMeta,
      Odds,
      Pick,
      Prediction,
      LeaderboardEntry,
      Market,
      StandingGroup,
      StandingRow,
      BracketRound,
      BracketMatch,
      VaultSnapshot,
      RebalanceDecision,
      AgentStatus,
      Notification,
      TermsAcceptance,
    },
  },
};
