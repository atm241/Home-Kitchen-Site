import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ParsedRecipe {
  name: string;
  description?: string;
  category?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  ingredients: Array<{ name: string; quantity?: number; unit?: string; notes?: string }>;
}

const CATEGORIES = [
  'Breakfast', 'Lunch', 'Dinner', 'Appetizers & Snacks', 'Sides',
  'Salads', 'Soups & Stews', 'Sauces & Condiments', 'Desserts',
  'Beverages', 'Baking & Breads',
];

/**
 * Extract a structured recipe from a photo (cookbook page, handwritten card,
 * printout, or screenshot) using Claude vision. Returns null when the image
 * doesn't contain a readable recipe.
 */
export async function parseRecipePhoto(
  image: string,
  mediaType: AllowedImageType
): Promise<ParsedRecipe | null> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: image },
          },
          {
            type: 'text',
            text: `Transcribe the recipe in this photo (cookbook page, handwritten card, printout, or screenshot) into JSON.
Return ONLY a JSON object with no other text, in exactly this shape:
{
  "name": "Recipe title",
  "description": "one-sentence description or null",
  "category": "one of: ${CATEGORIES.join(', ')} — or null",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "instructions": "Step one\\nStep two\\nStep three",
  "ingredients": [
    {"name": "flour", "quantity": 2, "unit": "cup", "notes": "sifted"}
  ]
}

Rules:
- Transcribe faithfully; don't invent ingredients or steps that aren't in the photo
- prep_time and cook_time are minutes (numbers) or null if not stated
- servings is a number or null if not stated
- Each instruction step on its own line, joined with \\n, without step numbers
- ingredient quantity is a number (convert fractions: 1/2 -> 0.5); unit is a short string like cup, tbsp, tsp, oz, lb, g, count; use null when absent
- ingredient name is the plain ingredient ("flour"), with preparation details in notes ("sifted")
- If the photo does not contain a readable recipe, return exactly: null`,
          },
        ],
      },
    ],
  });

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
