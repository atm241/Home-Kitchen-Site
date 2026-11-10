// Cleans up messy ingredient entries with a small Claude call.
//
// Recipes scraped from the web (schema.org JSON-LD) arrive as prose lines like
// "Half a cucumber, peeled, seeded and cut into 1/8-inch sticks" or "Kosher
// salt and black pepper". The regex parser in recipeScraper does its best, but
// prose leaks into ingredient names, which then pollutes the grocery list,
// pantry matching and "make with what I have". This pass turns each entry into
// a clean shoppable name plus quantity/unit/notes. Claude-based imports
// (video captions, photos) already produce clean entries and skip this.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface IngredientEntry {
  name: string;
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  notes?: string | null | undefined;
}

/** The cleaned shape: optional fields are undefined, matching the importers. */
export interface CleanIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

/** True when an entry still looks like prose rather than a clean name. */
export function looksMessy(ing: IngredientEntry): boolean {
  const name = (ing.name || '').trim();
  if (!name) return false;
  return (
    name.length > 28 ||
    /[,()]/.test(name) ||
    /\d/.test(name) ||
    /\b(plus|to taste|half|optional|divided|preferably|such as|cut into|about)\b/i.test(name)
  );
}

const SYSTEM = `You clean up recipe ingredient lists. The user sends a JSON array of ingredient entries; some have prose stuck in the name. Reply with ONLY a JSON array of the same length, in the same order, one output entry per input entry, each shaped {"name": string, "quantity": number|null, "unit": string|null, "notes": string|null}.

Rules:
- name: the plain ingredient someone would put on a shopping list ("cucumber", "yellow onion", "soy sauce"). No quantities, package sizes, or preparation.
- quantity: a number, or null when there is none ("half" -> 0.5, "One 14-ounce can" -> 1). Never 0.
- unit: a short unit like cup, tbsp, tsp, oz, lb, g, can, clove, piece, or null.
- notes: preparation, sizes and qualifiers ("peeled, seeded, cut into sticks", "14-ounce can", "or dill", "to taste"), or null.
- Keep paired staples as one entry: "Kosher salt and black pepper" keeps that name.
- Keep an entry's existing clean fields when they are already right.
- Never invent, merge, split, or reorder entries.`;

/**
 * Normalize a full ingredient list. Costs one small model call, and only when
 * at least one entry looks messy. On any failure the input comes back
 * unchanged — imports must never break because cleanup is unavailable.
 */
export async function normalizeIngredients<T extends IngredientEntry>(ingredients: T[]): Promise<T[] | CleanIngredient[]> {
  if (!ingredients.length || !ingredients.some(looksMessy)) return ingredients;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(ingredients) }],
    });
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return ingredients;
    const match = text.text.match(/\[[\s\S]*\]/);
    if (!match) return ingredients;
    const cleaned = JSON.parse(match[0]) as IngredientEntry[];
    if (!Array.isArray(cleaned) || cleaned.length !== ingredients.length) return ingredients;
    return cleaned.map((c, i) => {
      const name = typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : ingredients[i].name;
      const quantity = typeof c?.quantity === 'number' && c.quantity > 0 ? c.quantity : undefined;
      const unit = typeof c?.unit === 'string' && c.unit.trim() ? c.unit.trim() : undefined;
      const notes = typeof c?.notes === 'string' && c.notes.trim() ? c.notes.trim() : undefined;
      return { name, quantity, unit, notes };
    });
  } catch (error) {
    console.error('Ingredient cleanup failed; keeping originals:', error);
    return ingredients;
  }
}
