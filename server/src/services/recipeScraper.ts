import axios from 'axios';
import * as cheerio from 'cheerio';
import { categorizeIngredient } from './ingredientCategorizer';
import { cleanText } from '../utils/cleanText';

export interface ScrapedRecipe {
  name: string;
  description?: string;
  category?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  ingredients?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    notes?: string;
  }>;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  image_url?: string;
}

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Try to find JSON-LD schema first (most recipe sites use this)
    let recipe: ScrapedRecipe = {
      name: '',
    };

    const jsonLdScript = $('script[type="application/ld+json"]');

    console.log(`Found ${jsonLdScript.length} JSON-LD script tags`);

    if (jsonLdScript.length > 0) {
      jsonLdScript.each((_, element) => {
        try {
          const jsonData = JSON.parse($(element).html() || '{}');

          // Flatten: handle plain object, array, or @graph wrapper (Yoast/WordPress)
          const schemas = Array.isArray(jsonData) ? jsonData : [jsonData];
          const allNodes: any[] = [];
          for (const s of schemas) {
            if (s['@graph'] && Array.isArray(s['@graph'])) {
              allNodes.push(...s['@graph']);
            } else {
              allNodes.push(s);
            }
          }
          const isRecipeType = (t: any) =>
            t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
          const recipeSchema = allNodes.find((s) => isRecipeType(s['@type']));

          if (recipeSchema) {
            console.log('Found Recipe schema in JSON-LD');
            recipe.name = cleanText(recipeSchema.name);
            recipe.description = cleanText(recipeSchema.description);
            console.log(`  - Name: ${recipe.name}`);

            // Site's own category label(s), e.g. "dinner, weeknight" — used as
            // a hint for mapping into the app's fixed category list.
            if (recipeSchema.recipeCategory) {
              const rawCat = recipeSchema.recipeCategory;
              recipe.category = cleanText(
                Array.isArray(rawCat) ? rawCat.join(', ') : String(rawCat)
              );
            }

            // Parse servings/yield - can be a number, string, or array
            if (recipeSchema.recipeYield) {
              let yieldValue = recipeSchema.recipeYield;

              // If it's an array, take the first value
              if (Array.isArray(yieldValue)) {
                yieldValue = yieldValue[0];
              }

              // Extract number from string (e.g., "Serves 6", "6 servings", "Makes 4")
              if (typeof yieldValue === 'string') {
                const match = yieldValue.match(/\d+/);
                recipe.servings = match ? parseInt(match[0]) : undefined;
              } else if (typeof yieldValue === 'number') {
                recipe.servings = yieldValue;
              }
            }

            // Parse time (ISO 8601 duration format like PT30M)
            if (recipeSchema.prepTime) {
              recipe.prep_time = parseISODuration(recipeSchema.prepTime);
            }
            if (recipeSchema.cookTime) {
              recipe.cook_time = parseISODuration(recipeSchema.cookTime);
            }

            // Parse instructions
            if (recipeSchema.recipeInstructions) {
              if (Array.isArray(recipeSchema.recipeInstructions)) {
                console.log(`  - Found ${recipeSchema.recipeInstructions.length} instruction steps in JSON-LD`);
                recipe.instructions = recipeSchema.recipeInstructions
                  .map((step: any) =>
                    cleanText(typeof step === 'string' ? step : step.text || step.name)
                  )
                  .join('\n');
              } else if (typeof recipeSchema.recipeInstructions === 'string') {
                console.log('  - Found instructions (as string) in JSON-LD');
                recipe.instructions = cleanText(recipeSchema.recipeInstructions);
              }
            } else {
              console.log('  - No recipeInstructions found in JSON-LD');
            }

            // Parse ingredients
            if (recipeSchema.recipeIngredient && Array.isArray(recipeSchema.recipeIngredient)) {
              console.log(`  - Found ${recipeSchema.recipeIngredient.length} ingredients in JSON-LD`);
              recipe.ingredients = recipeSchema.recipeIngredient.map((ing: string) => {
                return parseIngredientString(cleanText(ing));
              });
            } else {
              console.log('  - No recipeIngredient found in JSON-LD');
            }

            // Parse nutrition
            if (recipeSchema.nutrition) {
              const nutrition = recipeSchema.nutrition;
              recipe.calories = parseInt(nutrition.calories) || undefined;
              recipe.protein = parseFloat(nutrition.proteinContent) || undefined;
              recipe.carbs = parseFloat(nutrition.carbohydrateContent) || undefined;
              recipe.fat = parseFloat(nutrition.fatContent) || undefined;
            }

            // Parse image
            if (recipeSchema.image) {
              const img = recipeSchema.image;
              if (typeof img === 'string') {
                recipe.image_url = img;
              } else if (Array.isArray(img) && img.length > 0) {
                recipe.image_url = typeof img[0] === 'string' ? img[0] : img[0]?.url;
              } else if (img.url) {
                recipe.image_url = img.url;
              }
            }
          }
        } catch (e) {
          // Continue to next script tag
        }
      });
    }

    // Fallback to common HTML selectors if JSON-LD didn't work
    if (!recipe.name) {
      recipe.name = cleanText($('h1').first().text() ||
                    $('.recipe-title').first().text() ||
                    $('[itemprop="name"]').first().text());
    }

    if (!recipe.description) {
      recipe.description = cleanText($('[itemprop="description"]').first().text() ||
                          $('.recipe-description').first().text() ||
                          $('meta[name="description"]').attr('content') ||
                          '');
    }

    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      console.log('Attempting HTML fallback for ingredients...');
      const ingredientsList: Array<{ name: string; quantity?: number; unit?: string; notes?: string }> = [];

      // Try multiple common selectors for ingredients
      const ingredientSelectors = [
        '[itemprop="recipeIngredient"]',
        '.recipe-ingredient',
        '.ingredient',
        '.structured-ingredients__list-item',
        '.mntl-structured-ingredients__list-item',
        'ul.ingredients li',
        '.ingredient-list li',
        '[data-ingredient]'
      ];

      for (const selector of ingredientSelectors) {
        $(selector).each((_, element) => {
          const text = cleanText($(element).text());
          if (text) {
            ingredientsList.push(parseIngredientString(text));
          }
        });

        if (ingredientsList.length > 0) {
          console.log(`  - Found ${ingredientsList.length} ingredients using selector: ${selector}`);
          break; // Found ingredients, stop trying other selectors
        }
      }

      if (ingredientsList.length > 0) {
        recipe.ingredients = ingredientsList;
      } else {
        console.log('  - No ingredients found via HTML fallback');
      }
    }

    // Fallback for instructions if not found in JSON-LD
    if (!recipe.instructions) {
      console.log('Attempting HTML fallback for instructions...');
      const instructionsList: string[] = [];

      // Try multiple common selectors for instructions
      const instructionSelectors = [
        '[itemprop="recipeInstructions"]',
        '.recipe-instructions',
        '.instructions',
        '.mntl-sc-block-html',
        '.recipe-procedure-text',
        '.instruction-list li',
        'ol.instructions li',
        '[data-instruction]'
      ];

      for (const selector of instructionSelectors) {
        $(selector).each((_, element) => {
          const text = cleanText($(element).text());
          if (text && text.length > 10) { // Filter out very short text that's probably not instructions
            instructionsList.push(text);
          }
        });

        if (instructionsList.length > 0) {
          console.log(`  - Found ${instructionsList.length} instruction steps using selector: ${selector}`);
          break; // Found instructions, stop trying other selectors
        }
      }

      if (instructionsList.length > 0) {
        recipe.instructions = instructionsList.join('\n');
      } else {
        console.log('  - No instructions found via HTML fallback');
      }
    }

    // Make sure we at least have a name
    if (!recipe.name) {
      throw new Error('Could not extract recipe name from the page');
    }

    return recipe;
  } catch (error: any) {
    console.error('Error scraping recipe:', error);
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
    throw new Error(`Failed to scrape recipe: ${error.message}`);
  }
}

function parseISODuration(duration: string): number {
  // Parse ISO 8601 duration format (e.g., PT30M = 30 minutes, PT1H30M = 90 minutes)
  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);

  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;

  return hours * 60 + minutes;
}

// Unicode vulgar fractions used throughout recipe sites (e.g. "¾ teaspoon").
const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4,
  '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375,
  '⅝': 0.625, '⅞': 0.875, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
};
const FRAC_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

function parseQuantity(raw: string): number | undefined {
  const s = raw.trim();
  const fracCharMatch = s.match(new RegExp(`[${FRAC_CHARS}]`));
  if (fracCharMatch) {
    const frac = UNICODE_FRACTIONS[fracCharMatch[0]] ?? 0;
    const intPart = s.replace(new RegExp(`[${FRAC_CHARS}]`), '').trim();
    const whole = intPart ? parseInt(intPart, 10) : 0;
    return Number((whole + frac).toFixed(3));
  }
  if (s.includes('/')) {
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); // "1 1/2"
    if (mixed) {
      return Number((parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])).toFixed(3));
    }
    const [num, denom] = s.split('/').map(Number);
    return denom ? Number((num / denom).toFixed(3)) : undefined;
  }
  return parseFloat(s);
}

function parseIngredientString(ingredientStr: string): {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
} {
  const original = ingredientStr.trim();
  let rest = original;
  let quantity: number | undefined;
  let unit: string | undefined;

  // Leading quantity: integer, decimal, ascii fraction, "1 1/2", unicode
  // fraction, or "1 ½".
  const qtyMatch = rest.match(
    new RegExp(`^\\s*(\\d+\\s*[${FRAC_CHARS}]|\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+\\.\\d+|\\d+|[${FRAC_CHARS}])`)
  );
  if (qtyMatch) {
    quantity = parseQuantity(qtyMatch[1]);
    rest = rest.slice(qtyMatch[0].length).trim();

    // Unit must be a whole word — the trailing \b stops "g"/"l"/"oz" from
    // eating the first letters of "garlic"/"large"/etc. Plurals via `s?`.
    const unitMatch = rest.match(
      /^(cups?|tbsps?|tablespoons?|tsps?|teaspoons?|ounces?|oz|lbs?|pounds?|grams?|g|kg|ml|liters?|l|cloves?|cans?|sticks?|pieces?|pinch(?:es)?|packages?|pkgs?)\b\.?/i
    );
    if (unitMatch) {
      unit = unitMatch[1].toLowerCase();
      if (unit === 'piece' || unit === 'pieces') unit = 'count';
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }

  return {
    name: rest || original,
    quantity,
    unit,
  };
}
