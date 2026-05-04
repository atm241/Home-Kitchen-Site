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

function parseIngredientString(ingredientStr: string): {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
} {
  // This is a basic parser - could be improved with a proper ingredient parsing library
  const parts = ingredientStr.trim().split(' ');

  let quantity: number | undefined;
  let unit: string | undefined;
  let name = ingredientStr.trim();

  // Try to extract quantity (first number in string)
  const quantityMatch = ingredientStr.match(/^(\d+(?:\/\d+)?|\d+\.\d+)/);
  if (quantityMatch) {
    const quantityStr = quantityMatch[1];
    if (quantityStr.includes('/')) {
      const [num, denom] = quantityStr.split('/').map(Number);
      quantity = num / denom;
    } else {
      quantity = parseFloat(quantityStr);
    }

    // Remove quantity from name
    name = ingredientStr.substring(quantityMatch[0].length).trim();

    // Try to extract unit (common cooking units)
    const unitMatch = name.match(/^(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|kg|ml|l|liter|liters|count|piece|pieces|clove|cloves|can|cans)/i);
    if (unitMatch) {
      unit = unitMatch[1].toLowerCase();
      // Normalize "piece" and "pieces" to "count"
      if (unit === 'piece' || unit === 'pieces') {
        unit = 'count';
      }
      name = name.substring(unitMatch[0].length).trim();
    }
  }

  return {
    name: name || ingredientStr.trim(),
    quantity,
    unit,
  };
}
