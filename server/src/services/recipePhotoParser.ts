import Anthropic from '@anthropic-ai/sdk';
import { ParsedRecipe, RECIPE_JSON_SHAPE, RECIPE_JSON_RULES, parseRecipeResponse } from './recipeJson';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export type { ParsedRecipe };

/**
 * Extract a structured recipe from a photo (cookbook page, handwritten card,
 * printout, or screenshot) using Claude vision. Returns null when the image
 * doesn't contain a readable recipe.
 */
export async function parseRecipePhoto(
  image: string,
  mediaType: AllowedImageType
): Promise<ParsedRecipe | null> {
  // Haiku handles photo transcription well at ~2% of Opus cost; bump to
  // claude-sonnet-5-5 if handwritten cards start coming back garbled.
  const message = await anthropic.messages.create({
    model: 'claude-haiku-5-5',
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
${RECIPE_JSON_SHAPE}

Rules:
- Transcribe faithfully; don't invent ingredients or steps that aren't in the photo
${RECIPE_JSON_RULES}
- If the photo does not contain a readable recipe, return exactly: null`,
          },
        ],
      },
    ],
  });

  return parseRecipeResponse(message);
}
