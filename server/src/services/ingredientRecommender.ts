import axios from 'axios';

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const BASE_URL = 'https://api.spoonacular.com';

export interface IngredientCombo {
  id: string;
  ingredients: Array<{
    name: string;
    image?: string;
  }>;
  unlockedRecipes: Array<{
    id: number;
    title: string;
    image: string;
    usedIngredientCount: number;
    missedIngredientCount: number;
  }>;
  recipeCount: number;
  impact: number; // Score based on recipe count and recipe ratings
}

/**
 * Find ingredient combinations that unlock popular recipes
 * @param pantryIngredients Current pantry ingredients
 * @param maxCombos Maximum number of combos to return
 */
export async function findIngredientCombos(
  pantryIngredients: string[],
  maxCombos: number = 5
): Promise<IngredientCombo[]> {
  try {
    console.log(`🔍 Finding ingredient combos based on ${pantryIngredients.length} pantry items`);

    // Get popular recipes that we're close to making
    const response = await axios.get(
      `${BASE_URL}/recipes/findByIngredients`,
      {
        params: {
          apiKey: SPOONACULAR_API_KEY,
          ingredients: pantryIngredients.join(',+'),
          number: 30, // Get more recipes to analyze
          ranking: 2, // Minimize missing ingredients
          ignorePantry: false,
        },
      }
    );

    const recipes = response.data;

    // Filter to recipes that are missing 2-4 ingredients
    const almostMakeableRecipes = recipes.filter((recipe: any) =>
      recipe.missedIngredientCount >= 2 &&
      recipe.missedIngredientCount <= 4
    );

    console.log(`✅ Found ${almostMakeableRecipes.length} almost-makeable recipes`);

    // Group recipes by their missing ingredient combinations
    const comboMap = new Map<string, {
      ingredients: Set<string>;
      recipes: any[];
      images: Map<string, string>;
    }>();

    for (const recipe of almostMakeableRecipes) {
      const missingIngredients = recipe.missedIngredients
        .map((ing: any) => ing.name.toLowerCase())
        .sort();

      const comboKey = missingIngredients.join('|');

      if (!comboMap.has(comboKey)) {
        const images = new Map<string, string>();
        recipe.missedIngredients.forEach((ing: any) => {
          if (ing.image) {
            images.set(ing.name.toLowerCase(), `https://spoonacular.com/cdn/ingredients_100x100/${ing.image}`);
          }
        });

        comboMap.set(comboKey, {
          ingredients: new Set(missingIngredients),
          recipes: [],
          images,
        });
      }

      comboMap.get(comboKey)!.recipes.push(recipe);
    }

    // Convert to array and score each combo
    const combos: IngredientCombo[] = Array.from(comboMap.entries())
      .map(([key, data]) => {
        const recipeCount = data.recipes.length;
        const avgLikes = data.recipes.reduce((sum: number, r: any) => sum + r.likes, 0) / recipeCount;
        const impact = recipeCount * Math.log(avgLikes + 1); // Score combining count and popularity

        return {
          id: key,
          ingredients: Array.from(data.ingredients).map(name => ({
            name,
            image: data.images.get(name),
          })),
          unlockedRecipes: data.recipes.slice(0, 3).map((r: any) => ({
            id: r.id,
            title: r.title,
            image: r.image,
            usedIngredientCount: r.usedIngredientCount,
            missedIngredientCount: r.missedIngredientCount,
          })),
          recipeCount,
          impact,
        };
      })
      .sort((a, b) => b.impact - a.impact) // Sort by impact score
      .slice(0, maxCombos);

    console.log(`✅ Returning ${combos.length} ingredient combos`);

    return combos;
  } catch (error) {
    console.error('❌ Error finding ingredient combos:', error);
    return [];
  }
}
