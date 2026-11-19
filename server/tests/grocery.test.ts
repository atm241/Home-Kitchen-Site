import { describe, it, expect } from 'vitest';
import { signUp, createRecipe } from './helpers';

const WEEK_START = '2026-11-16';
const WEEK_END = '2026-11-22';

describe('grocery list', () => {
  it('builds the list from planned meals, scaled by servings, minus the pantry', async () => {
    const user = await signUp();
    const recipeId = await createRecipe(user); // serves 2: 200 g spaghetti, 2 tbsp olive oil
    const recipe = (await user.api.get(`/api/recipes/${recipeId}`)).body;
    const spaghetti = recipe.ingredients.find((i: { name: string }) => i.name === 'spaghetti');

    await user.api.post('/api/meals').send({ recipe_id: recipeId, meal_date: '2026-11-18', meal_type: 'dinner', servings: 4 });
    await user.api.post('/api/pantry').send({ ingredient_id: spaghetti.ingredient_id, quantity: 150, unit: 'gram' });

    const res = await user.api.post('/api/grocery/generate').send({ week_start_date: WEEK_START, week_end_date: WEEK_END });
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((i: { ingredient_name: string; quantity: number }) => [i.ingredient_name, i.quantity]));
    expect(byName.spaghetti).toBe(250); // 400 needed for 4 servings, 150 on hand
    expect(byName['olive oil']).toBe(4);
  });

  it('adds, checks off and removes a manual item', async () => {
    const user = await signUp();
    const added = await user.api.post('/api/grocery').send({ ingredient_name: 'lemons', quantity: 3, unit: 'unit', week_start_date: WEEK_START });
    expect(added.status).toBe(201);

    expect((await user.api.patch(`/api/grocery/${added.body.id}/purchase`).send({ is_purchased: true })).status).toBe(200);
    let list = (await user.api.get(`/api/grocery?week_start_date=${WEEK_START}`)).body;
    expect(list.find((i: { id: number }) => i.id === added.body.id).is_purchased).toBe(true);

    await user.api.delete(`/api/grocery/${added.body.id}`);
    list = (await user.api.get(`/api/grocery?week_start_date=${WEEK_START}`)).body;
    expect(list.find((i: { id: number }) => i.id === added.body.id)).toBeUndefined();
  });
});
