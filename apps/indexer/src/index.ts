import { ponder } from 'ponder:registry';
import { account, debtCharge, deposit, withdrawal } from 'ponder:schema';

ponder.on('GoalyVault:Deposited', async ({ event, context }) => {
  await context.db.insert(deposit).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user: event.args.user,
    assets: event.args.assets,
    shares: event.args.shares,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(account)
    .values({
      address: event.args.user,
      principal: event.args.assets,
      shares: event.args.shares,
      debt: 0n,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      principal: row.principal + event.args.assets,
      shares: row.shares + event.args.shares,
      updatedBlock: event.block.number,
    }));
});

ponder.on('GoalyVault:DebtCharged', async ({ event, context }) => {
  await context.db.insert(debtCharge).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user: event.args.user,
    amount: event.args.amount,
    totalDebt: event.args.totalDebt,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(account)
    .values({
      address: event.args.user,
      principal: 0n,
      shares: 0n,
      debt: event.args.amount,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate(() => ({
      debt: event.args.totalDebt,
      updatedBlock: event.block.number,
    }));
});

ponder.on('GoalyVault:Withdrawn', async ({ event, context }) => {
  await context.db.insert(withdrawal).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user: event.args.user,
    assets: event.args.assets,
    sharesBurned: event.args.sharesBurned,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  // Withdrawal zeroes the position: principal returned, debt cleared by yield.
  await context.db
    .insert(account)
    .values({
      address: event.args.user,
      principal: 0n,
      shares: 0n,
      debt: 0n,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate(() => ({
      principal: 0n,
      shares: 0n,
      debt: 0n,
      updatedBlock: event.block.number,
    }));
});
