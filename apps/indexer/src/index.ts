import { ponder } from 'ponder:registry';
import { account, deposit, withdrawal } from 'ponder:schema';

ponder.on('GoalyVault:Deposited', async ({ event, context }) => {
  await context.db.insert(deposit).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    receiver: event.args.receiver,
    assets: event.args.assets,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(account)
    .values({
      address: event.args.receiver,
      balance: event.args.assets,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      balance: row.balance + event.args.assets,
      updatedBlock: event.block.number,
    }));
});

ponder.on('GoalyVault:Withdrawn', async ({ event, context }) => {
  await context.db.insert(withdrawal).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    owner: event.args.owner,
    receiver: event.args.receiver,
    assets: event.args.assets,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(account)
    .values({
      address: event.args.owner,
      balance: 0n,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      balance: row.balance > event.args.assets ? row.balance - event.args.assets : 0n,
      updatedBlock: event.block.number,
    }));
});
