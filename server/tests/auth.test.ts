import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signUp, uniqueEmail, PASSWORD } from './helpers';

describe('signup and login', () => {
  it('creates a user in a new household and returns a working token', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/signup').send({ email, password: PASSWORD, name: 'Ana' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email, name: 'Ana' });
    expect(res.body.user.password_hash).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.household.inviteCode).toMatch(/\S+/);
  });

  it('rejects short passwords, missing fields and duplicate emails', async () => {
    const email = uniqueEmail();
    expect((await request(app).post('/api/auth/signup').send({ email, password: 'short', name: 'A' })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ email, password: PASSWORD })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ email, password: PASSWORD, name: 'A' })).status).toBe(201);
    const dup = await request(app).post('/api/auth/signup').send({ email: email.toUpperCase(), password: PASSWORD, name: 'B' });
    expect(dup.status).toBe(409);
  });

  it('logs in case-insensitively and rejects a wrong password', async () => {
    const user = await signUp();
    const ok = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const bad = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    const nobody = await request(app).post('/api/auth/login').send({ email: uniqueEmail(), password: PASSWORD });
    expect(nobody.status).toBe(401);
  });

  it('requires a valid token on protected routes', async () => {
    expect((await request(app).get('/api/recipes')).status).toBe(401);
    expect((await request(app).get('/api/recipes').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
  });

  it('joins an existing household with its invite code', async () => {
    const owner = await signUp();
    const me = await owner.api.get('/api/auth/me');
    const member = await signUp({ inviteCode: me.body.household.inviteCode });
    expect(member.householdId).toBe(owner.householdId);

    const members = await owner.api.get('/api/auth/household/members');
    expect(members.body.map((m: { id: number }) => m.id).sort()).toEqual([owner.userId, member.userId].sort());

    const bad = await request(app)
      .post('/api/auth/signup')
      .send({ email: uniqueEmail(), password: PASSWORD, name: 'X', inviteCode: 'NOPE0000' });
    expect(bad.status).toBe(400);
  });

  it('regenerating the invite code retires the old one', async () => {
    const owner = await signUp();
    const before = (await owner.api.get('/api/auth/me')).body.household.inviteCode;
    const regen = await owner.api.post('/api/auth/household/invite-code');
    expect(regen.status).toBe(200);
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: uniqueEmail(), password: PASSWORD, name: 'Late', inviteCode: before });
    expect(res.status).toBe(400);
  });

  it('changes a password only with the current one', async () => {
    const user = await signUp();
    const wrong = await user.api.post('/api/auth/change-password').send({ currentPassword: 'nope-nope-nope', newPassword: 'brand-new-pass' });
    expect(wrong.status).toBe(400);
    const ok = await user.api.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'brand-new-pass' });
    expect(login.status).toBe(200);
  });

  it('lets a household member reset another member, but never someone outside it', async () => {
    const owner = await signUp();
    const code = (await owner.api.get('/api/auth/me')).body.household.inviteCode;
    const member = await signUp({ inviteCode: code });
    const stranger = await signUp();

    const reset = await owner.api
      .post(`/api/auth/household/members/${member.userId}/reset-password`)
      .send({ newPassword: 'reset-by-owner', currentPassword: PASSWORD });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: member.email, password: 'reset-by-owner' })).status).toBe(200);

    const cross = await owner.api
      .post(`/api/auth/household/members/${stranger.userId}/reset-password`)
      .send({ newPassword: 'hijacked-pass', currentPassword: PASSWORD });
    expect(cross.status).toBe(404);
    expect((await request(app).post('/api/auth/login').send({ email: stranger.email, password: PASSWORD })).status).toBe(200);
  });
});
