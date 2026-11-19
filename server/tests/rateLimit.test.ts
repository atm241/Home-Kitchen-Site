import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { signUp, PASSWORD } from './helpers';

describe('login rate limit', () => {
  it('blocks after 10 failed logins, and successful logins never count', async () => {
    const limited = createApp({ rateLimits: true });
    const user = await signUp();

    for (let i = 0; i < 5; i++) {
      expect((await request(limited).post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(200);
    }
    for (let i = 0; i < 10; i++) {
      expect((await request(limited).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' })).status).toBe(401);
    }
    const blocked = await request(limited).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many attempts/);
  });
});
