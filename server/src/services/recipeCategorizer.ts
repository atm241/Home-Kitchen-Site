import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Must stay in sync with the category <select> in client AddRecipe.tsx.
export const RECIPE_CATEGORIES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Appetizers & Snacks',
  'Sides',
  'Salads',
  'Soups & Stews',
  'Sauces & Condiments',
  'Desserts',
  'Beverages',
  'Baking & Breads',
];

/**
 * Categorize a recipe into one of the app's fixed categories using Claude,
 * with the source site's own category string (JSON-LD recipeCategory) as a
 * hint and a rule-based fallback. Mirrors ingredientCategorizer.
 */
export async function categorizeRecipe(
  name: string,
  description?: string,
  sourceCategory?: string
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackCategorizeRecipe(name, sourceCategory);
  }
  try {
    console.log(`🤖 Using AI to categorize recipe: "${name}"`);
    const message = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Categorize this recipe into ONE of these categories: ${RECIPE_CATEGORIES.join(', ')}.

Recipe: "${name}"${description ? `\nDescription: ${description.slice(0, 200)}` : ''}${sourceCategory ? `\nThe source website labels it: "${sourceCategory}"` : ''}

Respond with ONLY the category name, nothing else.`
      }]
    });

    const response = message.content[0];
    if (response.type === 'text') {
      const category = response.text.trim();
      if (RECIPE_CATEGORIES.includes(category)) {
        console.log(`✅ AI categorized "${name}" as: ${category}`);
        return category;
      }
      console.log(`⚠️  AI response "${category}" not a valid recipe category, using fallback`);
    }
    return fallbackCategorizeRecipe(name, sourceCategory);
  } catch (error) {
    console.error('❌ Error categorizing recipe with AI:', error);
    return fallbackCategorizeRecipe(name, sourceCategory);
  }
}

function fallbackCategorizeRecipe(name: string, sourceCategory?: string): string {
  const text = `${name} ${sourceCategory || ''}`.toLowerCase();

  if (/soup|stew|chili|chowder|broth/.test(text)) return 'Soups & Stews';
  if (/salad/.test(text)) return 'Salads';
  if (/\bsauce\b|marinara|pesto|dressing|condiment|salsa/.test(text)) return 'Sauces & Condiments';
  if (/cookie|cake|torte|brownie|dessert|pie\b|pudding|ice cream/.test(text)) return 'Desserts';
  if (/bread|muffin|dough|biscuit|scone|roll\b/.test(text)) return 'Baking & Breads';
  if (/pancake|waffle|omelet|scrambled|breakfast|brunch|granola/.test(text)) return 'Breakfast';
  if (/appetizer|snack|dip\b|starter/.test(text)) return 'Appetizers & Snacks';
  if (/side dish|\bsides?\b/.test(text)) return 'Sides';
  if (/smoothie|drink|cocktail|lemonade|beverage/.test(text)) return 'Beverages';
  if (/sandwich|wrap\b|lunch/.test(text)) return 'Lunch';
  return 'Dinner';
}
