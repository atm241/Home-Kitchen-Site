import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterAll } from 'vitest';
import { createApp } from '../src/app';
import pool from '../src/config/database';

/** One app per test file, without rate limits (see rateLimit.test.ts for those). */
export const app = createApp({ rateLimits: false });

afterAll(async () => {
  await pool.end();
});

export const PASSWORD = 'correct-horse-battery';

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID().slice(0, 8)}@test.local`;
}

export interface TestUser {
  token: string;
  userId: number;
  householdId: number;
  email: string;
  /** Requests carrying this user's login. */
  api: ReturnType<typeof authed>;
}

function authed(token: string) {
  const withAuth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string) => withAuth(request(app).post(url)),
    put: (url: string) => withAuth(request(app).put(url)),
    patch: (url: string) => withAuth(request(app).patch(url)),
    delete: (url: string) => withAuth(request(app).delete(url)),
  };
}

/** Sign up a fresh user: in a new household, or in an existing one by invite code. */
export async function signUp(opts: { inviteCode?: string; name?: string } = {}): Promise<TestUser> {
  const email = uniqueEmail();
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: PASSWORD, name: opts.name || 'Test Cook', inviteCode: opts.inviteCode });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
  return {
    token: res.body.token,
    userId: res.body.user.id,
    householdId: me.body.household.id,
    email,
    api: authed(res.body.token),
  };
}

/** Create a recipe the simple way (no AI involved). Returns its id. */
export async function createRecipe(user: TestUser, name = 'Test Pasta'): Promise<number> {
  const res = await user.api.post('/api/recipes').send({
    name,
    servings: 2,
    instructions: 'Boil water.\nCook pasta.',
    ingredients: [
      { name: 'spaghetti', quantity: 200, unit: 'gram' },
      { name: 'olive oil', quantity: 2, unit: 'tablespoon' },
    ],
  });
  if (res.status !== 201) throw new Error(`createRecipe failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}
