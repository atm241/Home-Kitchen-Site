// A route that opens a transaction and then returns early (bad input, not
// found) must close it before giving the connection back to the pool. If it
// doesn't, the next request on that connection runs inside the leftover open
// transaction, and its writes look saved but are never committed.
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import { signUp } from './helpers';

async function committedEventTitles(householdId: number): Promise<string[]> {
  // A separate connection only sees committed rows.
  const outside = new Client({ connectionString: process.env.DATABASE_URL });
  await outside.connect();
  const r = await outside.query('SELECT title FROM calendar_events WHERE household_id = $1', [householdId]);
  await outside.end();
  return r.rows.map((row) => row.title);
}

describe('transactions', () => {
  // Each case is a request that BEGINs and then bails out with a 4xx.
  const earlyExits: Array<[string, (u: Awaited<ReturnType<typeof signUp>>) => Promise<unknown>]> = [
    ['grocery generate without dates', (u) => u.api.post('/api/grocery/generate').send({})],
    ['recipe update with a bad id', (u) => u.api.put('/api/recipes/abc').send({ name: 'x' })],
    ['recipe update of a missing recipe', (u) => u.api.put('/api/recipes/99999999').send({ name: 'x' })],
    ['grocery from a missing recipe', (u) => u.api.post('/api/grocery/from-recipe').send({ recipe_id: 99999999, week_start_date: '2026-11-16' })],
    ['add-to-pantry without a week', (u) => u.api.post('/api/grocery/add-to-pantry').send({})],
  ];

  for (const [label, exit] of earlyExits) {
    it(`a later write still commits after: ${label}`, async () => {
      const user = await signUp();
      const early = (await exit(user)) as { status: number };
      expect(early.status).toBeGreaterThanOrEqual(400);
      expect(early.status).toBeLessThan(500);

      const title = `after ${label}`;
      const created = await user.api.post('/api/calendar').send({ title, event_date: '2026-11-20', event_type: 'event' });
      expect(created.status).toBe(201);
      expect(await committedEventTitles(user.householdId)).toContain(title);
    });
  }
});
