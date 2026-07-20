import pool from '../config/database';
import { cleanText } from '../utils/cleanText';
import { RecipeRecommendation } from './spoonacularService';

// Only surface saved recipes the pantry can meaningfully cover. Tunable:
// lower it to show more of a large curated collection, raise it to keep the
// recommender strict.
const MIN_MATCH_PCT = 50;
const MAX_RESULTS = 20;

// Words that carry no ingredient identity — ignored so they don't create
// spurious matches (e.g. pantry "Olive Oil" shouldn't match on "oil" alone
// via a stopword, but should on the real tokens).
const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'plus', 'more', 'taste', 'fresh', 'large',
  'small', 'medium', 'chopped', 'sliced', 'diced', 'minced', 'ground',
  'about', 'into', 'such', 'your', 'from', 'optional', 'needed', 'serving',
]);

const singular = (w: string) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);

// Reduce a free-text ingredient string to a set of significant word stems.
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map(singular)
  );
}

/**
 * Rank the household's own saved recipes by how much of each one the current
 * pantry covers, matching by fuzzy word overlap rather than exact ingredient
 * identity. A recipe ingredient counts as "have it" when every significant
 * token of some pantry item appears in the ingredient text — so pantry
 * "Olive Oil" covers "extra-virgin olive oil" and "Garlic" covers "garlic
 * cloves, thinly sliced". Pantry staples count as available even at zero qty.
 */
export async function findSavedRecipeMatches(
  householdId: number
): Promise<RecipeRecommendation[]> {
  const pantryResult = await pool.query(
    `SELECT i.name
     FROM pantry p JOIN ingredients i ON i.id = p.ingredient_id
     WHERE p.household_id = $1 AND (p.quantity > 0 OR p.is_staple = true)`,
    [householdId]
  );

  // Each pantry item becomes a list of tokens that must ALL be present in a
  // recipe ingredient for it to count (so "Onion Powder" won't match a fresh
  // onion, but "Onion" would).
  const pantryTokenSets = pantryResult.rows
    .map((r) => [...tokenize(r.name)])
    .filter((toks) => toks.length > 0);

  if (pantryTokenSets.length === 0) return [];

  const recipesResult = await pool.query(
    `SELECT r.id, r.name, r.description, r.image_url, r.source_url,
            r.prep_time, r.servings, r.calories,
            array_agg(i.name) AS ingredients
     FROM recipes r
     JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE r.household_id = $1
     GROUP BY r.id`,
    [householdId]
  );

  const covers = (ingredientText: string): boolean => {
    const words = tokenize(ingredientText);
    if (words.size === 0) return false;
    return pantryTokenSets.some((toks) => toks.every((t) => words.has(t)));
  };

  const recommendations: RecipeRecommendation[] = recipesResult.rows.map((row) => {
    const ingredients: string[] = (row.ingredients || []).filter(Boolean);
    const available: string[] = [];
    const missing: string[] = [];
    for (const ing of ingredients) {
      (covers(ing) ? available : missing).push(ing);
    }
    const total = ingredients.length;
    const matchPercentage = total > 0 ? Math.round((available.length / total) * 100) : 0;

    return {
      id: row.id,
      name: row.name,
      description: row.description ? cleanText(row.description).substring(0, 150) : '',
      image: row.image_url || '',
      sourceUrl: row.source_url || '',
      rating: 0, // saved recipes have no external rating; UI shows a "Saved" badge
      prepTime: row.prep_time || 0,
      servings: row.servings || 1,
      matchPercentage,
      missingIngredients: missing,
      availableIngredients: available,
      calories: row.calories || undefined,
      source: 'saved',
    };
  });

  return recommendations
    .filter((r) => r.matchPercentage >= MIN_MATCH_PCT)
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, MAX_RESULTS);
}
