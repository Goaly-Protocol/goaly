import { Hono } from 'hono';
import { graphql } from 'ponder';
import { db } from 'ponder:api';
import schema from 'ponder:schema';

const app = new Hono();

// GraphQL over the indexed data — lets the API read derived state (e.g. goUSDT balances)
// without hitting an RPC. Interactive explorer at /graphql.
app.use('/graphql', graphql({ db, schema }));

export default app;
