import { describe, it, expect, afterEach } from 'vitest';
import { reserveAiCall, dailyLimit } from '../src/services/aiQuota';
import { signUp } from './helpers';

afterEach(() => {
  delete process.env.AI_DAILY_LIMIT_PHOTO;
});

describe('daily AI caps', () => {
  it('uses the defaults unless overridden', () => {
    expect(dailyLimit('video')).toBe(25);
    expect(dailyLimit('photo')).toBe(20);
    expect(dailyLimit('receipt')).toBe(30);
    process.env.AI_DAILY_LIMIT_PHOTO = '5';
    expect(dailyLimit('photo')).toBe(5);
    process.env.AI_DAILY_LIMIT_PHOTO = 'nonsense';
    expect(dailyLimit('photo')).toBe(20);
  });

  it('allows exactly the limit, even when requests arrive at the same moment', async () => {
    const { householdId } = await signUp();
    process.env.AI_DAILY_LIMIT_PHOTO = '3';
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveAiCall(householdId, 'photo')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(5);
    expect(rejected[0].reason.status).toBe(429);
    expect(rejected[0].reason.message).toMatch(/today's 3 recipe photo scans/);
  });

  it('counts each household separately and each kind separately', async () => {
    const a = await signUp();
    const b = await signUp();
    process.env.AI_DAILY_LIMIT_PHOTO = '1';
    await reserveAiCall(a.householdId, 'photo');
    await expect(reserveAiCall(a.householdId, 'photo')).rejects.toMatchObject({ status: 429 });
    await expect(reserveAiCall(b.householdId, 'photo')).resolves.toBeUndefined();
    await expect(reserveAiCall(a.householdId, 'receipt')).resolves.toBeUndefined();
  });

  it('a limit of 0 turns the feature off with its own message', async () => {
    const { householdId } = await signUp();
    process.env.AI_DAILY_LIMIT_PHOTO = '0';
    await expect(reserveAiCall(householdId, 'photo')).rejects.toMatchObject({
      status: 429,
      message: expect.stringMatching(/turned off/),
    });
  });

  it('the photo route refuses once the cap is used, before any AI call', async () => {
    const user = await signUp();
    process.env.AI_DAILY_LIMIT_PHOTO = '0';
    const res = await user.api.post('/api/recipes/parse-photo').send({ image: 'aGVsbG8=', mediaType: 'image/png' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/turned off/);
  });
});
