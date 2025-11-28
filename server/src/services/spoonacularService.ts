import axios from 'axios';

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const BASE_URL = 'https://api.spoonacular.com';

interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  missedIngredients: Array<{
    id: number;
    name: string;
    amount: number;
    unit: string;
  }>;
  usedIngredients: Array<{
    id: number;
    name: string;
    amount: number;
    unit: string;
  }>;
  likes: number;
}

interface RecipeDetails {
  id: number;
  title: string;
  image: string;
  servings: number;
  readyInMinutes: number;
  sourceUrl: string;
  spoonacularScore: number;
  healthScore: number;
  pricePerServing: number;
  extendedIngredients: Array<{
    id: number;
    name: string;
    amount: number;
    unit: string;
  }>;
  instructions: string;
  summary: string;
  nutrition?: {
    nutrients: Array<{
      name: string;
      amount: number;
      unit: string;
    }>;
  };
}

export interface RecipeRecommendation {
  id: number;
  name: string;
  description: string;
  image: string;
  sourceUrl: string;
  rating: number;
  prepTime: number;
  servings: number;
  matchPercentage: number;
  missingIngredients: string[];
  availableIngredients: string[];
  calories?: number;
}

/**
 * Find recipes by ingredients in pantry
 * @param ingredients Array of ingredient names
 * @param ranking How to rank results: 1 (minimize missing), 2 (maximize used)
 */
export async function findRecipesByIngredients(
  ingredients: string[],
  ranking: 1 | 2 = 2
): Promise<RecipeRecommendation[]> {
  try {
    console.log(`🔍 Searching Spoonacular for recipes with: ${ingredients.join(', ')}`);

    const ingredientsParam = ingredients.join(',+');
    const response = await axios.get<SpoonacularRecipe[]>(
      `${BASE_URL}/recipes/findByIngredients`,
      {
        params: {
          apiKey: SPOONACULAR_API_KEY,
          ingredients: ingredientsParam,
          number: 5,
          ranking,
          ignorePantry: false,
        },
      }
    );

    console.log(`✅ Found ${response.data.length} recipes from Spoonacular`);

    // Get detailed info for each recipe
    const recommendations = await Promise.all(
      response.data.map(async (recipe) => {
        try {
          const details = await getRecipeDetails(recipe.id);

          const totalIngredients = recipe.usedIngredientCount + recipe.missedIngredientCount;
          const matchPercentage = Math.round((recipe.usedIngredientCount / totalIngredients) * 100);

          // Get calories from nutrition data
          let calories: number | undefined;
          if (details.nutrition) {
            const calorieNutrient = details.nutrition.nutrients.find(n => n.name === 'Calories');
            if (calorieNutrient) {
              calories = Math.round(calorieNutrient.amount);
            }
          }

          return {
            id: recipe.id,
            name: recipe.title,
            description: details.summary.replace(/<[^>]*>/g, '').substring(0, 150) + '...',
            image: recipe.image,
            sourceUrl: details.sourceUrl,
            rating: Math.min(5, details.spoonacularScore / 20), // Convert 0-100 to 0-5
            prepTime: details.readyInMinutes,
            servings: details.servings,
            matchPercentage,
            missingIngredients: recipe.missedIngredients.map(ing => ing.name),
            availableIngredients: recipe.usedIngredients.map(ing => ing.name),
            calories,
          };
        } catch (error) {
          console.error(`Error fetching details for recipe ${recipe.id}:`, error);
          // Return basic info if details fetch fails
          const totalIngredients = recipe.usedIngredientCount + recipe.missedIngredientCount;
          const matchPercentage = Math.round((recipe.usedIngredientCount / totalIngredients) * 100);

          return {
            id: recipe.id,
            name: recipe.title,
            description: 'A delicious recipe',
            image: recipe.image,
            sourceUrl: '',
            rating: 4.0,
            prepTime: 30,
            servings: 4,
            matchPercentage,
            missingIngredients: recipe.missedIngredients.map(ing => ing.name),
            availableIngredients: recipe.usedIngredients.map(ing => ing.name),
          };
        }
      })
    );

    // Filter to only show recipes with 70% or more match
    return recommendations.filter(r => r.matchPercentage >= 70);
  } catch (error) {
    console.error('❌ Error fetching recipes from Spoonacular:', error);
    return [];
  }
}

/**
 * Get detailed information about a specific recipe
 */
export async function getRecipeDetails(recipeId: number): Promise<RecipeDetails> {
  const response = await axios.get<RecipeDetails>(
    `${BASE_URL}/recipes/${recipeId}/information`,
    {
      params: {
        apiKey: SPOONACULAR_API_KEY,
        includeNutrition: true,
      },
    }
  );

  return response.data;
}
