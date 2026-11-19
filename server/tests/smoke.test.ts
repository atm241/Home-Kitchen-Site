import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './helpers';

describe('smoke', () => {
  it('reports a healthy database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });
});
