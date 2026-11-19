import { describe, it, expect } from 'vitest';
import { signUp } from './helpers';

describe('budget', () => {
  it('has no budget until one is set', async () => {
    const user = await signUp();
    const status = await user.api.get('/api/planner/status');
    expect(status.status).toBe(200);
    expect(status.body.budget).toBeNull();
  });

  it('subtracts receipt totals from the budget', async () => {
    const user = await signUp();
    const saved = await user.api.post('/api/planner/budget').send({ budget_amount: 300, period_days: 30 });
    expect(saved.status).toBe(200);
    expect(saved.body.budget).toMatchObject({ amount: 300, spent: 0, remaining: 300 });

    await user.api.post('/api/budget/receipts').send({ total: 84.12, store_name: 'Smiths' });
    await user.api.post('/api/budget/receipts').send({ total: 15.88 });

    const status = await user.api.get('/api/planner/status');
    expect(status.body.budget).toMatchObject({ amount: 300, spent: 100, remaining: 200 });
  });

  it("doesn't count another household's receipts", async () => {
    const a = await signUp();
    const b = await signUp();
    await a.api.post('/api/planner/budget').send({ budget_amount: 100 });
    await b.api.post('/api/budget/receipts').send({ total: 60 });
    expect((await a.api.get('/api/planner/status')).body.budget.spent).toBe(0);
  });

  it('rejects nonsense receipt totals', async () => {
    const user = await signUp();
    for (const total of [0, -5, 'abc', null]) {
      expect((await user.api.post('/api/budget/receipts').send({ total })).status).toBe(400);
    }
  });

  it('clearing the amount removes the budget but keeps the goals', async () => {
    const user = await signUp();
    await user.api.post('/api/planner/budget').send({ budget_amount: 250, daily_calories: 2200 });
    const cleared = await user.api.post('/api/planner/budget').send({ budget_amount: null, daily_calories: 2200 });
    expect(cleared.body.budget).toBeNull();
    expect(cleared.body.preferences.daily_calories).toBe(2200);
  });
});
