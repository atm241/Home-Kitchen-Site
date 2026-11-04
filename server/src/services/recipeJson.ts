import type Anthropic from '@anthropic-ai/sdk';

// Shared pieces for every "have Claude turn X into a recipe" path (photos,
// video captions, transcripts) so they all return the same validated shape.

export interface ParsedRecipe {
  name: string;
  description?: string;
  category?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  // Per-serving estimates, used by the meal planner.
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  ingredients: Array<{ name: string; quantity?: number; unit?: string; notes?: string }>;
}

export const CATEGORIES = [
  'Breakfast', 'Lunch', 'Dinner', 'Appetizers & Snacks', 'Sides',
  'Salads', 'Soups & Stews', 'Sauces & Condiments', 'Desserts',
  'Beverages', 'Baking & Breads',
];

export const RECIPE_JSON_SHAPE = `{
  "name": "Recipe title",
  "description": "one-sentence description or null",
  "category": "one of: ${CATEGORIES.join(', ')} — or null",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "instructions": "Step one\\nStep two\\nStep three",
  "nutrition": {"calories": 520, "protein": 32, "carbs": 48, "fat": 20, "fiber": 6},
  "ingredients": [
    {"name": "flour", "quantity": 2, "unit": "cup", "notes": "sifted"}
  ]
}`;

export const RECIPE_JSON_RULES = `- prep_time and cook_time are minutes (numbers) or null if not stated
- servings is a number or null if not stated
- nutrition is your best estimate PER SERVING from the ingredients and servings (calories in kcal, the rest in grams), or null if there are too few ingredients to estimate
- Each instruction step on its own line, joined with \\n, without step numbers
- ingredient quantity is a number (convert fractions: 1/2 -> 0.5); unit is a short string like cup, tbsp, tsp, oz, lb, g, count; use null when absent
- ingredient name is the plain ingredient ("flour"), with preparation details in notes ("sifted")`;

/** Pull the recipe JSON out of a Claude response and validate it. */
export function parseRecipeResponse(message: Anthropic.Message): ParsedRecipe | null {
  const content = message.content.find(block => block.type === 'text');
  if (!content || content.type !== 'text') return null;

  const text = content.text.trim();
  if (text === 'null') return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: ParsedRecipe;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;

  return {
    name: parsed.name.trim(),
    description: parsed.description || undefined,
    category: parsed.category && CATEGORIES.includes(parsed.category) ? parsed.category : undefined,
    servings: typeof parsed.servings === 'number' && parsed.servings > 0 ? parsed.servings : undefined,
    prep_time: typeof parsed.prep_time === 'number' && parsed.prep_time > 0 ? parsed.prep_time : undefined,
    cook_time: typeof parsed.cook_time === 'number' && parsed.cook_time > 0 ? parsed.cook_time : undefined,
    instructions: typeof parsed.instructions === 'string' ? parsed.instructions : undefined,
    ...parseNutrition((parsed as { nutrition?: unknown }).nutrition),
    ingredients: Array.isArray(parsed.ingredients)
      ? parsed.ingredients
          .filter(ing => ing && typeof ing.name === 'string' && ing.name.trim())
          .map(ing => ({
            name: ing.name.trim(),
            quantity: typeof ing.quantity === 'number' && ing.quantity > 0 ? ing.quantity : undefined,
            unit: typeof ing.unit === 'string' && ing.unit ? ing.unit : undefined,
            notes: typeof ing.notes === 'string' && ing.notes ? ing.notes : undefined,
          }))
      : [],
  };
}

const NUTRITION_LIMITS = { calories: 5000, protein: 300, carbs: 600, fat: 300, fiber: 150 } as const;

function parseNutrition(raw: unknown): Partial<Pick<ParsedRecipe, keyof typeof NUTRITION_LIMITS>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Pick<ParsedRecipe, keyof typeof NUTRITION_LIMITS>> = {};
  for (const key of Object.keys(NUTRITION_LIMITS) as Array<keyof typeof NUTRITION_LIMITS>) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number' && v > 0 && v <= NUTRITION_LIMITS[key]) {
      out[key] = key === 'calories' ? Math.round(v) : Math.round(v * 10) / 10;
    }
  }
  return out;
}
