import pool from '../config/database';
import { cleanText } from '../utils/cleanText';
import { RecipeRecommendation } from './spoonacularService';

// Only surface saved recipes the pantry can meaningfully cover. Tunable:
// lower it to show more of a large curated collection, raise it to keep the
// recommender strict.
const MIN_MATCH_PCT = 50;
const MAX_RESULTS = 20;

/**
 * Rank the household's own saved recipes (URL imports, curated collections,
 * hand-entered recipes) by how much of each one the current pantry covers.
 *
 * Matching is by ingredient_id, which is exact because recipe ingredients and
 * pantry items reference the same household-scoped `ingredients` table. Pantry
 * staples (olive oil, salt, etc.) count as available even at zero quantity.
 */
export async function findSavedRecipeMatches(
  householdId: number
): Promise<RecipeRecommendation[]> {
  const result = await pool.query(
    `
    WITH pantry_ing AS (
      SELECT ingredient_id
      FROM pantry
      WHERE household_id = $1
        AND ingredient_id IS NOT NULL
        AND (quantity > 0 OR is_staple = true)
    )
    SELECT
      r.id,
      r.name,
      r.description,
      r.image_url,
      r.source_url,
      r.prep_time,
      r.servings,
      r.calories,
      COUNT(ri.ingredient_id) AS total,
      COUNT(*) FILTER (WHERE pi.ingredient_id IS NOT NULL) AS have,
      ARRAY_AGG(i.name) FILTER (WHERE pi.ingredient_id IS NULL)     AS missing,
      ARRAY_AGG(i.name) FILTER (WHERE pi.ingredient_id IS NOT NULL) AS available
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN ingredients i ON i.id = ri.ingredient_id
    LEFT JOIN pantry_ing pi ON pi.ingredient_id = ri.ingredient_id
    WHERE r.household_id = $1
    GROUP BY r.id
    HAVING COUNT(ri.ingredient_id) > 0
    `,
    [householdId]
  );

  const recommendations: RecipeRecommendation[] = result.rows.map((row) => {
    const total = Number(row.total);
    const have = Number(row.have);
    const matchPercentage = total > 0 ? Math.round((have / total) * 100) : 0;

    return {
      id: row.id,
      name: row.name,
      description: row.description
        ? cleanText(row.description).substring(0, 150)
        : '',
      image: row.image_url || '',
      sourceUrl: row.source_url || '',
      // Saved recipes carry no external rating; the UI shows a "Saved" badge
      // for these instead of stars (see source flag below).
      rating: 0,
      prepTime: row.prep_time || 0,
      servings: row.servings || 1,
      matchPercentage,
      missingIngredients: row.missing || [],
      availableIngredients: row.available || [],
      calories: row.calories || undefined,
      source: 'saved',
    };
  });

  return recommendations
    .filter((r) => r.matchPercentage >= MIN_MATCH_PCT)
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, MAX_RESULTS);
}
