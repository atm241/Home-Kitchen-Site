# AI-Powered Ingredient Categorization

This application uses Claude AI to automatically categorize ingredients when they are added to the system.

## Setup

1. **Install the Anthropic SDK:**
   ```bash
   cd server
   npm install @anthropic-ai/sdk
   ```

2. **Get an Anthropic API Key:**
   - Go to https://console.anthropic.com/
   - Sign up or log in
   - Navigate to API Keys
   - Create a new API key

3. **Add the API Key to your environment:**
   - Open `server/.env`
   - Add: `ANTHROPIC_API_KEY=your_actual_api_key_here`

## How It Works

When a new ingredient is added to the system (through recipes, grocery lists, or pantry), the AI categorizer:

1. **Tries AI categorization first:** Uses Claude 3.5 Haiku to intelligently categorize the ingredient into one of these categories:
   - Produce
   - Proteins
   - Dairy
   - Grains & Pasta
   - Canned Goods
   - Baking
   - Spices & Seasonings
   - Condiments & Sauces
   - Oils & Vinegars
   - Beverages
   - Snacks
   - Other

2. **Falls back to rule-based categorization:** If the AI fails or the API is unavailable, it uses keyword matching to categorize the ingredient

3. **Works automatically:** No user input required - ingredients are categorized as they're added

## Where It's Used

The AI categorizer runs automatically when:
- Adding manual items to the grocery list
- Importing recipes from URLs
- Creating custom recipes with new ingredients
- Adding ingredients through the pantry

## Cost

Claude 3.5 Haiku is extremely cost-effective:
- ~$0.001 per 1,000 ingredient categorizations
- For typical home use, this will cost pennies per month

## Fallback Behavior

If the API key is not set or the API is unavailable, the system will automatically fall back to rule-based categorization, so the app will continue to work normally.
