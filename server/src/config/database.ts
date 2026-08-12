import { Pool, types } from 'pg';
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

export default pool;
