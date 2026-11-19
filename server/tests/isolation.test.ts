// The most important property of a multi-household app: nothing one
// household does can read, change or delete another household's data, and
// no ID taken from a request can pull another household's rows in.
import { beforeAll, describe, it, expect } from 'vitest';
import { signUp, createRecipe, TestUser } from './helpers';

const WEEK = '2026-11-16';

let alice: TestUser;
let bob: TestUser;
const a: Record<string, number> = {};

beforeAll(async () => {
  alice = await signUp({ name: 'Alice' });
  bob = await signUp({ name: 'Bob' });

  a.recipe = await createRecipe(alice, 'Alice Secret Stew');
  const recipe = (await alice.api.get(`/api/recipes/${a.recipe}`)).body;
  a.ingredient = recipe.ingredients[0].ingredient_id;

  a.pantry = (await alice.api.post('/api/pantry').send({ ingredient_id: a.ingredient, quantity: 1, unit: 'unit' })).body.id;
  a.grocery = (await alice.api.post('/api/grocery').send({ ingredient_name: 'saffron', quantity: 1, unit: 'unit', week_start_date: WEEK })).body.id;
  a.event = (await alice.api.post('/api/calendar').send({ title: 'Alice dinner party', event_date: '2026-11-20', event_type: 'event' })).body.id;
  a.meal = (await alice.api.post('/api/meals').send({ recipe_id: a.recipe, meal_date: '2026-11-18', meal_type: 'dinner', servings: 2 })).body.id;
  a.cook = (await alice.api.post('/api/cook-history').send({ recipe_id: a.recipe, recipe_name: 'Alice Secret Stew', servings_cooked: 2 })).body.id;
  a.receipt = (await alice.api.post('/api/budget/receipts').send({ total: 42.5, store_name: 'Smiths' })).body.id;

  for (const [k, v] of Object.entries(a)) {
    if (!v) throw new Error(`setup failed to create Alice's ${k}`);
  }
});

describe('reading', () => {
  it("never lists another household's rows", async () => {
    const lists = await Promise.all([
      bob.api.get('/api/recipes'),
      bob.api.get('/api/pantry'),
      bob.api.get(`/api/grocery?week_start_date=${WEEK}`),
      bob.api.get('/api/calendar?start_date=2026-11-01&end_date=2026-11-30'),
      bob.api.get('/api/meals?start_date=2026-11-01&end_date=2026-11-30'),
      bob.api.get('/api/cook-history'),
      bob.api.get('/api/budget/receipts'),
      bob.api.get('/api/ingredients'),
    ]);
    for (const res of lists) {
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Alice');
      expect(text).not.toContain('saffron');
      expect(text).not.toContain('spaghetti');
    }
  });

  it("can't fetch another household's rows by id", async () => {
    expect((await bob.api.get(`/api/recipes/${a.recipe}`)).status).toBe(404);
    expect((await bob.api.get(`/api/meals/${a.meal}`)).status).toBe(404);
    expect((await bob.api.get(`/api/ingredients/${a.ingredient}`)).status).toBe(404);
  });
});

describe('changing and deleting', () => {
  it("can't edit another household's rows", async () => {
    expect((await bob.api.put(`/api/recipes/${a.recipe}`).send({ name: 'Hijacked' })).status).toBe(404);
    expect((await bob.api.patch(`/api/recipes/${a.recipe}/favorite`)).status).toBe(404);
    expect((await bob.api.put(`/api/pantry/${a.pantry}`).send({ quantity: 99 })).status).toBe(404);
    expect((await bob.api.put(`/api/grocery/${a.grocery}`).send({ quantity: 99 })).status).toBe(404);
    expect((await bob.api.patch(`/api/grocery/${a.grocery}/purchase`).send({ is_purchased: true })).status).toBe(404);
    expect((await bob.api.put(`/api/calendar/${a.event}`).send({ title: 'Hijacked', event_date: '2026-11-20' })).status).toBe(404);
    expect((await bob.api.put(`/api/meals/${a.meal}`).send({ recipe_id: a.recipe, meal_date: '2026-11-19', meal_type: 'dinner', servings: 9 })).status).toBe(404);

    const recipe = await alice.api.get(`/api/recipes/${a.recipe}`);
    expect(recipe.body.name).toBe('Alice Secret Stew');
    expect(recipe.body.is_favorite).toBeFalsy();
  });

  it("deleting another household's rows leaves them in place", async () => {
    await bob.api.delete(`/api/recipes/${a.recipe}`);
    await bob.api.delete(`/api/pantry/${a.pantry}`);
    await bob.api.delete(`/api/grocery/${a.grocery}`);
    await bob.api.delete(`/api/calendar/${a.event}`);
    await bob.api.delete(`/api/meals/${a.meal}`);
    await bob.api.delete(`/api/cook-history/${a.cook}`);
    await bob.api.delete(`/api/budget/receipts/${a.receipt}`);
    await bob.api.delete(`/api/ingredients/${a.ingredient}`);

    expect((await alice.api.get(`/api/recipes/${a.recipe}`)).status).toBe(200);
    expect((await alice.api.get(`/api/meals/${a.meal}`)).status).toBe(200);
    expect((await alice.api.get(`/api/ingredients/${a.ingredient}`)).status).toBe(200);
    const ids = async (url: string) => (await alice.api.get(url)).body.map((r: { id: number }) => r.id);
    expect(await ids('/api/pantry')).toContain(a.pantry);
    expect(await ids(`/api/grocery?week_start_date=${WEEK}`)).toContain(a.grocery);
    expect(await ids('/api/cook-history')).toContain(a.cook);
    expect(await ids('/api/budget/receipts')).toContain(a.receipt);
  });
});

describe("referencing another household's ids", () => {
  it("won't link another household's ingredient into a new recipe", async () => {
    const res = await bob.api.post('/api/recipes').send({
      name: 'Bob borrows',
      servings: 1,
      ingredients: [{ ingredient_id: a.ingredient, quantity: 1, unit: 'unit' }],
    });
    if (res.status === 201) {
      expect(res.body.ingredients.map((i: { ingredient_id: number }) => i.ingredient_id)).not.toContain(a.ingredient);
    } else {
      expect(res.status).toBe(400);
    }
  });

  it("won't link another household's ingredient when editing a recipe", async () => {
    const mine = await createRecipe(bob, 'Bob Toast');
    const res = await bob.api.put(`/api/recipes/${mine}`).send({
      name: 'Bob Toast',
      ingredients: [{ ingredient_id: a.ingredient, quantity: 1, unit: 'unit' }],
    });
    const after = await bob.api.get(`/api/recipes/${mine}`);
    expect(JSON.stringify(after.body)).not.toContain('spaghetti');
    expect([200, 400]).toContain(res.status);
  });

  it("won't add another household's ingredient to the pantry", async () => {
    const res = await bob.api.post('/api/pantry').send({ ingredient_id: a.ingredient, quantity: 1, unit: 'unit' });
    expect(res.status).toBe(404);
    expect(JSON.stringify((await bob.api.get('/api/pantry')).body)).not.toContain('spaghetti');
  });

  it("won't schedule another household's recipe", async () => {
    const res = await bob.api.post('/api/meals').send({ recipe_id: a.recipe, meal_date: '2026-11-18', meal_type: 'dinner', servings: 2 });
    expect(res.status).toBe(404);
    expect(JSON.stringify((await bob.api.get('/api/meals?start_date=2026-11-01&end_date=2026-11-30')).body)).not.toContain('Alice');
  });

  it("won't move a meal onto another household's recipe", async () => {
    const mine = await createRecipe(bob, 'Bob Soup');
    const meal = (await bob.api.post('/api/meals').send({ recipe_id: mine, meal_date: '2026-11-18', meal_type: 'lunch', servings: 1 })).body.id;
    const res = await bob.api.put(`/api/meals/${meal}`).send({ recipe_id: a.recipe, meal_date: '2026-11-18', meal_type: 'lunch', servings: 1 });
    expect(res.status).toBe(404);
  });

  it("won't log cooking another household's recipe", async () => {
    const res = await bob.api.post('/api/cook-history').send({ recipe_id: a.recipe, recipe_name: 'x', servings_cooked: 1 });
    expect(res.status).toBe(404);
  });

  it("won't price another household's ingredient", async () => {
    const res = await bob.api.post('/api/grocery/prices').send({ ingredient_id: a.ingredient, store_name: 'Smiths', price: 1 });
    expect(res.status).toBe(404);
  });

  it("won't build a grocery list from another household's recipe", async () => {
    const res = await bob.api.post('/api/grocery/from-recipe').send({ recipe_id: a.recipe, week_start_date: WEEK });
    expect(res.status).toBe(404);
  });
});
