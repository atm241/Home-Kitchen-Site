import pool from '../config/database';

interface ShelfLifeRow {
  keyword: string | null;
  category: string;
  days: number;
}

let cache: ShelfLifeRow[] | null = null;

async function loadTable(): Promise<ShelfLifeRow[]> {
  if (cache) return cache;
  const result = await pool.query<ShelfLifeRow>(
    'SELECT keyword, category, days FROM shelf_life'
  );
  // Longest keywords first so "chicken breast" wins over "chicken"
  cache = result.rows.sort(
    (a, b) => (b.keyword?.length || 0) - (a.keyword?.length || 0)
  );
  return cache;
}

/** Clear the in-memory cache (call after re-seeding the table). */
export function resetShelfLifeCache(): void {
  cache = null;
}

function matchesName(keyword: string, name: string): boolean {
  // Whole-word match so "corn" doesn't match "cornstarch"
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(name);
}

/**
 * Days of shelf life for a food, counted from its purchase date.
 *
 * Keyword matches are scoped to the item's own category first, because the
 * same word means very different things across categories — "canned tomatoes"
 * must not inherit the 5-day shelf life of fresh tomatoes. Only when the
 * category tells us nothing (e.g. "Other") do we search keywords globally.
 *
 * Returns null when nothing matches — better to leave the expiration blank
 * than to invent a date.
 */
export async function getShelfLifeDays(
  ingredientName: string,
  category?: string | null
): Promise<number | null> {
  const table = await loadTable();
  const name = ingredientName.toLowerCase();

  if (category) {
    // 1. Most specific keyword within this category
    const inCategory = table.find(
      row => row.keyword && row.category === category && matchesName(row.keyword, name)
    );
    if (inCategory) return inCategory.days;

    // 2. This category's default
    const fallback = table.find(row => row.keyword === null && row.category === category);
    if (fallback) return fallback.days;
  }

  // 3. No usable category — fall back to a keyword match from any category
  const anyCategory = table.find(row => row.keyword && matchesName(row.keyword, name));
  return anyCategory ? anyCategory.days : null;
}

/**
 * Expiration date (YYYY-MM-DD) for a food bought on `purchaseDate`, or null if
 * we have no shelf-life data for it.
 */
export async function getExpirationDate(
  ingredientName: string,
  category?: string | null,
  purchaseDate: Date = new Date()
): Promise<string | null> {
  const days = await getShelfLifeDays(ingredientName, category);
  if (days === null) return null;
  const expiry = new Date(purchaseDate);
  expiry.setDate(expiry.getDate() + days);
  return expiry.toISOString().split('T')[0];
}
