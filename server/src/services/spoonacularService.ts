import axios from 'axios';
import { cleanText } from '../utils/cleanText';

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const BASE_URL = 'https://api.spoonacular.com';

function ensureApiKey(): string {
  if (!SPOONACULAR_API_KEY) {
    throw new Error('SPOONACULAR_API_KEY environment variable is not set');
  }
  return SPOONACULAR_API_KEY;
}

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
  // 'spoonacular' (default/undefined) for API results, 'saved' for the
  // household's own recipes ranked against the pantry.
  source?: 'spoonacular' | 'saved';
}

/**
 * Find recipes by ingredients in pantry using a single bulk detail fetch.
 * @param ingredients Array of ingredient names
 * @param ranking How to rank results: 1 (minimize missing), 2 (maximize used)
 */
export async function findRecipesByIngredients(
  ingredients: string[],
  ranking: 1 | 2 = 2
): Promise<RecipeRecommendation[]> {
  const apiKey = ensureApiKey();

  try {
    console.log(`🔍 Searching Spoonacular for recipes with: ${ingredients.join(', ')}`);

    const searchResponse = await axios.get<SpoonacularRecipe[]>(
      `${BASE_URL}/recipes/findByIngredients`,
      {
        params: {
          apiKey,
          ingredients: ingredients.join(',+'),
          number: 5,
          ranking,
          ignorePantry: false,
        },
      }
    );

    if (searchResponse.data.length === 0) {
      console.log('ℹ️  No matching recipes found');
      return [];
    }

    console.log(`✅ Found ${searchResponse.data.length} recipes from Spoonacular`);

    // Fetch all recipe details in a single bulk API call instead of N individual calls
    const ids = searchResponse.data.map(r => r.id).join(',');
    const detailsResponse = await axios.get<RecipeDetails[]>(
      `${BASE_URL}/recipes/informationBulk`,
      {
        params: {
          apiKey,
          ids,
          includeNutrition: true,
        },
      }
    );

    const detailsMap = new Map(detailsResponse.data.map(d => [d.id, d]));

    const recommendations = searchResponse.data.map(recipe => {
      const details = detailsMap.get(recipe.id);
      const totalIngredients = recipe.usedIngredientCount + recipe.missedIngredientCount;
      const matchPercentage = totalIngredients > 0
        ? Math.round((recipe.usedIngredientCount / totalIngredients) * 100)
        : 0;

      if (!details) {
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
          missingIngredients: recipe.missedIngredients.map(i => i.name),
          availableIngredients: recipe.usedIngredients.map(i => i.name),
        };
      }

      const calorieNutrient = details.nutrition?.nutrients.find(n => n.name === 'Calories');

      return {
        id: recipe.id,
        name: recipe.title,
        description: cleanText(details.summary).substring(0, 150) + '...',
        image: recipe.image,
        sourceUrl: details.sourceUrl,
        rating: Math.min(5, details.spoonacularScore / 20),
        prepTime: details.readyInMinutes,
        servings: details.servings,
        matchPercentage,
        missingIngredients: recipe.missedIngredients.map(i => i.name),
        availableIngredients: recipe.usedIngredients.map(i => i.name),
        calories: calorieNutrient ? Math.round(calorieNutrient.amount) : undefined,
      };
    });

    const filtered = recommendations.filter(r => r.matchPercentage >= 70);
    console.log(`✅ Returning ${filtered.length} recommendations (≥70% match)`);
    return filtered;
  } catch (error) {
    console.error('❌ Error fetching recipes from Spoonacular:', error);
    return [];
  }
}

/**
 * Get detailed information about a specific recipe
 */
export async function getRecipeDetails(recipeId: number): Promise<RecipeDetails> {
  const apiKey = ensureApiKey();

  const response = await axios.get<RecipeDetails>(
    `${BASE_URL}/recipes/${recipeId}/information`,
    {
      params: {
        apiKey,
        includeNutrition: true,
      },
    }
  );

  return response.data;
}
