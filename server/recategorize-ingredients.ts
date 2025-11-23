import pool from './src/config/database';
import { categorizeIngredient } from './src/services/ingredientCategorizer';

async function recategorizeAllIngredients() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting ingredient recategorization...\n');
    
    // Get all ingredients
    const result = await client.query('SELECT id, name, category FROM ingredients ORDER BY name');
    const ingredients = result.rows;
    
    console.log(`Found ${ingredients.length} ingredients to process\n`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const ingredient of ingredients) {
      const newCategory = await categorizeIngredient(ingredient.name);
      
      if (newCategory !== ingredient.category) {
        await client.query(
          'UPDATE ingredients SET category = $1 WHERE id = $2',
          [newCategory, ingredient.id]
        );
        console.log(`✏️  Updated: "${ingredient.name}" from "${ingredient.category}" to "${newCategory}"`);
        updated++;
      } else {
        console.log(`✓ Kept: "${ingredient.name}" as "${ingredient.category}"`);
        skipped++;
      }
    }
    
    console.log(`\n✅ Recategorization complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${skipped}`);
    console.log(`   Total: ${ingredients.length}`);
    
  } catch (error) {
    console.error('❌ Error recategorizing ingredients:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

recategorizeAllIngredients();
