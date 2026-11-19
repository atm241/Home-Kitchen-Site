import { Pool, PoolClient, types } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// pg returns NUMERIC as a string, because numeric is arbitrary-precision and
// JS doubles can't represent all of it losslessly. Correct in general, but for
// this app it's been a persistent bug source: budget_amount.toFixed() crashed
// the calendar, and weekly calories "summed" to "0944700" because + on strings
// concatenates. Every value we store as numeric is money, grams, or a small
// quantity — nowhere near the 2^53 limit — so parsing to float is safe here and
// removes a whole class of bug rather than patching each call site.
//
types.setTypeParser(types.builtins.NUMERIC, (value: string) => parseFloat(value));

// int8/bigint gets the same treatment, and it matters more than it looks:
// SUM() over an ordinary integer column returns bigint, so `SUM(calories)`
// arrived as a string and the weekly total "summed" to "0944700" by string
// concatenation. count() lands here too.
//
// Safe because of what we actually count: recipes, pantry items, and calorie
// totals are in the thousands, against a 9,007,199,254,740,991 ceiling for
// exact integers in JS. Nothing in this schema can approach that.
types.setTypeParser(types.builtins.INT8, (value: string) => parseInt(value, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err: Error) => {
  console.error('❌ Database connection error:', err.message);
  console.error('Full error:', err);
  // Don't exit immediately - let the application handle it gracefully
});

/**
 * Return a client from pool.connect() to the pool, rolling back first if a
 * transaction is still open. Use this instead of client.release().
 *
 * A route that BEGINs and then returns early (bad input, not found) leaves
 * its transaction open, and the next request on that connection would run
 * inside it: its writes would look saved but never commit.
 *
 * Inside a transaction now() is the transaction's start time, which differs
 * from statement_timestamp(); outside one they are equal (Postgres documents
 * that they match on a transaction's first statement).
 */
export async function releaseClient(client: PoolClient): Promise<void> {
  try {
    const r = await client.query('SELECT now() <> statement_timestamp() AS in_transaction');
    if (r.rows[0]?.in_transaction) await client.query('ROLLBACK');
    client.release();
  } catch (error) {
    // A failed transaction rejects even that SELECT. Passing the error
    // destroys the connection instead of handing a broken one to the next request.
    client.release(error as Error);
  }
}

export default pool;
