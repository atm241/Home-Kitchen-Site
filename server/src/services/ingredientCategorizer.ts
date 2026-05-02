import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Predefined categories that match your pantry categories
const CATEGORIES = [
  'Produce',
  'Proteins',
  'Dairy',
  'Grains & Pasta',
  'Canned Goods',
  'Baking',
  'Spices & Seasonings',
  'Condiments & Sauces',
  'Oils & Vinegars',
  'Beverages',
  'Snacks',
  'Other'
];

export async function categorizeIngredient(ingredientName: string): Promise<string> {
  try {
    console.log(`🤖 Using AI to categorize: "${ingredientName}"`);
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Categorize the following ingredient into ONE of these categories: ${CATEGORIES.join(', ')}.

Ingredient: "${ingredientName}"

Respond with ONLY the category name, nothing else.`
      }]
    });

    const response = message.content[0];
    if (response.type === 'text') {
      const category = response.text.trim();
      console.log(`✅ AI categorized "${ingredientName}" as: ${category}`);

      // Validate that the response is one of our categories
      if (CATEGORIES.includes(category)) {
        return category;
      }
      console.log(`⚠️  AI response "${category}" not in valid categories, using fallback`);
    }

    // Fallback to rule-based categorization if AI fails
    console.log(`⚠️  Using fallback categorization for: "${ingredientName}"`);
    return fallbackCategorize(ingredientName);
  } catch (error) {
    console.error('❌ Error categorizing ingredient with AI:', error);
    console.log(`⚠️  Using fallback categorization for: "${ingredientName}"`);
    // Fallback to rule-based categorization
    return fallbackCategorize(ingredientName);
  }
}

// Simple rule-based fallback categorization
function fallbackCategorize(ingredientName: string): string {
  const name = ingredientName.toLowerCase();

  // Produce
  if (/vegetable|fruit|lettuce|tomato|onion|garlic|pepper|carrot|celery|potato|apple|banana|orange|lemon|lime|berry|mushroom|herb|cilantro|parsley|basil|spinach|kale|broccoli|cauliflower/i.test(name)) {
    return 'Produce';
  }

  // Proteins
  if (/chicken|beef|pork|fish|salmon|tuna|shrimp|turkey|lamb|meat|tofu|egg|bacon|sausage/i.test(name)) {
    return 'Proteins';
  }

  // Dairy
  if (/milk|cheese|butter|cream|yogurt|sour cream|cottage cheese|cheddar|mozzarella|parmesan/i.test(name)) {
    return 'Dairy';
  }

  // Grains & Pasta
  if (/rice|pasta|bread|flour|noodle|spaghetti|linguine|penne|quinoa|oats|cereal|tortilla/i.test(name)) {
    return 'Grains & Pasta';
  }

  // Canned Goods
  if (/canned|can of|beans|chickpea|lentil|tomato paste|tomato sauce|soup/i.test(name)) {
    return 'Canned Goods';
  }

  // Baking
  if (/sugar|baking powder|baking soda|vanilla|cocoa|chocolate chip|yeast|cornstarch/i.test(name)) {
    return 'Baking';
  }

  // Spices & Seasonings
  if (/spice|seasoning|salt|pepper|cumin|paprika|oregano|thyme|rosemary|cinnamon|nutmeg|ginger|curry|chili powder/i.test(name)) {
    return 'Spices & Seasonings';
  }

  // Condiments & Sauces
  if (/sauce|ketchup|mustard|mayo|mayonnaise|soy sauce|hot sauce|bbq|salsa|pesto|dressing/i.test(name)) {
    return 'Condiments & Sauces';
  }

  // Oils & Vinegars
  if (/oil|olive oil|vegetable oil|vinegar|balsamic/i.test(name)) {
    return 'Oils & Vinegars';
  }

  // Beverages
  if (/juice|soda|tea|coffee|wine|beer|water|drink/i.test(name)) {
    return 'Beverages';
  }

  // Snacks
  if (/chip|cracker|cookie|candy|nut|almond|cashew|peanut|snack/i.test(name)) {
    return 'Snacks';
  }

  return 'Other';
}
