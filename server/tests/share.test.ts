import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signUp } from './helpers';

describe('phone share key', () => {
  it('only the current key opens the Shortcut endpoint', async () => {
    const user = await signUp();
    expect((await user.api.get('/api/share/key')).body.hasKey).toBe(false);

    const first = (await user.api.post('/api/share/key')).body.key;
    expect(first).toBeTruthy();
    const ok = await request(app).post('/api/share/import').set('Authorization', `Bearer ${first}`).send({});
    expect(ok.status).toBe(400); // authenticated; nothing was shared

    const second = (await user.api.post('/api/share/key')).body.key;
    const old = await request(app).post('/api/share/import').set('Authorization', `Bearer ${first}`).send({ url: 'https://example.com' });
    expect(old.status).toBe(401);

    await user.api.delete('/api/share/key');
    const revoked = await request(app).post('/api/share/import').set('Authorization', `Bearer ${second}`).send({ url: 'https://example.com' });
    expect(revoked.status).toBe(401);
  });

  it('a login token is not a share key', async () => {
    const user = await signUp();
    const res = await request(app).post('/api/share/import').set('Authorization', `Bearer ${user.token}`).send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
  });
});
