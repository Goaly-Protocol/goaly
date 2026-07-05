import { ponder } from 'ponder:registry';
import { claim, market, prediction, user } from 'ponder:schema';

// Predicted(bytes32 indexed marketId, address indexed user, Outcome outcome, uint256 stake)
ponder.on('GoalyMarkets:Predicted', async ({ event, context }) => {
  await context.db.insert(prediction).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    marketId: event.args.marketId,
    user: event.args.user,
    outcome: event.args.outcome,
    stake: event.args.stake,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(user)
    .values({
      address: event.args.user,
      totalStaked: event.args.stake,
      totalPrize: 0n,
      predictionCount: 1,
      claimCount: 0,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      totalStaked: row.totalStaked + event.args.stake,
      predictionCount: row.predictionCount + 1,
      updatedBlock: event.block.number,
    }));
});

// Claimed(bytes32 indexed marketId, address indexed user, uint256 stakeReturned, uint256 prize)
ponder.on('GoalyMarkets:Claimed', async ({ event, context }) => {
  await context.db.insert(claim).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    marketId: event.args.marketId,
    user: event.args.user,
    stakeReturned: event.args.stakeReturned,
    prize: event.args.prize,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(user)
    .values({
      address: event.args.user,
      totalStaked: 0n,
      totalPrize: event.args.prize,
      predictionCount: 0,
      claimCount: 1,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      totalPrize: row.totalPrize + event.args.prize,
      claimCount: row.claimCount + 1,
      updatedBlock: event.block.number,
    }));
});

// MarketCreated(bytes32 indexed marketId, uint64 closeTime)
ponder.on('GoalyMarkets:MarketCreated', async ({ event, context }) => {
  await context.db
    .insert(market)
    .values({
      id: event.args.marketId,
      status: 'OPEN',
      closeTime: event.args.closeTime,
      result: null,
      winningStake: null,
      prize: null,
      createdBlock: event.block.number,
      settledBlock: null,
      updatedTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate({
      status: 'OPEN',
      closeTime: event.args.closeTime,
      createdBlock: event.block.number,
      updatedTimestamp: event.block.timestamp,
    });
});

// MarketSettled(bytes32 indexed marketId, Outcome result, uint256 winningStake, uint256 prize)
ponder.on('GoalyMarkets:MarketSettled', async ({ event, context }) => {
  await context.db
    .insert(market)
    .values({
      id: event.args.marketId,
      status: 'SETTLED',
      closeTime: 0n, // unknown if MarketCreated wasn't indexed; overwritten by the update path
      result: event.args.result,
      winningStake: event.args.winningStake,
      prize: event.args.prize,
      createdBlock: event.block.number,
      settledBlock: event.block.number,
      updatedTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate({
      status: 'SETTLED',
      result: event.args.result,
      winningStake: event.args.winningStake,
      prize: event.args.prize,
      settledBlock: event.block.number,
      updatedTimestamp: event.block.timestamp,
    });
});
