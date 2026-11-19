import { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

// Table names can't be query parameters, so only these fixed names are ever
// interpolated.
const OWNED_TABLES = ['recipes', 'ingredients'] as const;
type OwnedTable = (typeof OWNED_TABLES)[number];

/**
 * True when `id` is a row of `table` that belongs to the household.
 *
 * Any id that arrives in a request body (recipe_id, ingredient_id) must pass
 * this before it's written into another row. Otherwise a household could
 * link another household's recipe or ingredient into its own data and read
 * it back through that link.
 */
export async function belongsToHousehold(
  db: Queryable,
  table: OwnedTable,
  id: unknown,
  householdId: number | undefined
): Promise<boolean> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || !householdId) return false;
  if (!OWNED_TABLES.includes(table)) throw new Error(`Unsupported table ${table}`);
  const result = await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND household_id = $2`, [n, householdId]);
  return (result.rowCount ?? 0) > 0;
}
