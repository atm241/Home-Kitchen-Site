// Store prices, against a local fake of the Kroger API.
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import pool from '../src/config/database';
import { priceItems, findStores, resetKrogerToken } from '../src/services/krogerService';
import { signUp } from './helpers';

const LOCATION = 'TEST0001';
const calls = { token: 0, products: 0 };
const PRODUCTS: Record<string, unknown[]> = {
  'kosher salt': [
    { productId: '1', description: "Lay's Salted Potato Chips", items: [{ price: { regular: 3.99, promo: 0 }, size: '8 oz' }] },
    { productId: '2', description: 'Morton Kosher Salt', items: [{ price: { regular: 4.49, promo: 0 }, size: '3 lb' }] },
  ],
  strawberries: [
    { productId: '3', description: 'Fresh Strawberries', items: [{ price: { regular: 4.99, promo: 2.99 }, size: '1 lb' }] },
  ],
  lemons: [{ productId: '4', description: 'Lemons', items: [{ price: { regular: 0.79, promo: 0 }, size: '1 ct' }] }],
};

let server: Server;

beforeAll(async () => {
  const fake = express();
  fake.post('/connect/oauth2/token', (req, res) => {
    calls.token++;
    if (req.headers.authorization !== 'Basic ' + Buffer.from('id:secret').toString('base64')) return res.status(401).end();
    res.json({ access_token: 'tok', expires_in: 1800 });
  });
  fake.get('/locations', (_req, res) => {
    res.json({ data: [{ locationId: LOCATION, chain: 'SMITHS', name: "Smith's Sugar House", address: { addressLine1: '1 Main St', city: 'Salt Lake City', state: 'UT' } }] });
  });
  fake.get('/products', (req, res) => {
    calls.products++;
    if (req.headers.authorization !== 'Bearer tok') return res.status(401).end();
    res.json({ data: PRODUCTS[String(req.query['filter.term'])] || [] });
  });
  server = await new Promise<Server>((resolve) => {
    const s = fake.listen(0, '127.0.0.1', () => resolve(s));
  });
  process.env.KROGER_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.KROGER_CLIENT_ID = 'id';
  process.env.KROGER_CLIENT_SECRET = 'secret';
});

afterAll(async () => {
  await pool.query('DELETE FROM kroger_price_cache WHERE location_id = $1', [LOCATION]);
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  await pool.query('DELETE FROM kroger_price_cache WHERE location_id = $1', [LOCATION]);
  calls.token = 0;
  calls.products = 0;
  resetKrogerToken();
});

describe('krogerService', () => {
  it('finds stores near a ZIP code', async () => {
    const stores = await findStores('84106');
    expect(stores[0]).toMatchObject({ locationId: LOCATION, name: "Smith's Sugar House" });
    expect(stores[0].address).toContain('Salt Lake City');
  });

  it('picks relevant products, uses sale prices, and caches hits and misses', async () => {
    const items = [
      { id: 1, name: 'Kosher Salt' },
      { id: 2, name: 'strawberries' },
      { id: 3, name: 'dragonfruit powder' },
      { id: 4, name: 'ok' },
    ];
    const first = await priceItems(LOCATION, items);
    expect(first[0].match).toMatchObject({ description: 'Morton Kosher Salt', price: 4.49 });
    expect(first[1].match).toMatchObject({ price: 2.99, regularPrice: 4.99 });
    expect(first[2].match).toBeNull();
    expect(first[3].match).toBeNull(); // too short to search
    expect(calls).toEqual({ token: 1, products: 3 });

    const second = await priceItems(LOCATION, items);
    expect(calls.products).toBe(3);
    expect(second[1].match).toMatchObject({ price: 2.99, regularPrice: 4.99 });
  });

  it('reports rejected credentials plainly', async () => {
    process.env.KROGER_CLIENT_SECRET = 'wrong';
    resetKrogerToken();
    await expect(findStores('84106')).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/credentials/) });
    process.env.KROGER_CLIENT_SECRET = 'secret';
  });
});

describe('/api/stores', () => {
  it('lets a household pick a store and estimates the unchecked list', async () => {
    const user = await signUp();
    expect((await user.api.get('/api/stores/status')).body).toEqual({ configured: true, store: null });
    expect((await user.api.get('/api/stores/search?zip=abc')).status).toBe(400);

    const found = await user.api.get('/api/stores/search?zip=84106');
    expect(found.body[0].locationId).toBe(LOCATION);
    expect((await user.api.put('/api/stores/mine').send({ locationId: LOCATION, name: "Smith's Sugar House" })).status).toBe(200);

    const week = '2026-11-16';
    await user.api.post('/api/grocery').send({ ingredient_name: 'strawberries', quantity: 1, unit: 'unit', week_start_date: week });
    const lemons = await user.api.post('/api/grocery').send({ ingredient_name: 'lemons', quantity: 3, unit: 'unit', week_start_date: week });
    await user.api.post('/api/grocery').send({ ingredient_name: 'kosher salt', quantity: 1, unit: 'unit', week_start_date: week });

    let estimate = (await user.api.get(`/api/stores/estimate?week_start_date=${week}`)).body;
    expect(estimate.store.name).toBe("Smith's Sugar House");
    expect(estimate.total).toBeCloseTo(2.99 + 0.79 + 4.49, 2);

    await user.api.patch(`/api/grocery/${lemons.body.id}/purchase`).send({ is_purchased: true });
    estimate = (await user.api.get(`/api/stores/estimate?week_start_date=${week}`)).body;
    expect(estimate.total).toBeCloseTo(2.99 + 4.49, 2);
    expect(estimate.items.map((i: { name: string }) => i.name)).not.toContain('lemons');
  });

  it('rejects a malformed store id', async () => {
    const user = await signUp();
    expect((await user.api.put('/api/stores/mine').send({ locationId: "1'; DROP TABLE x;--" })).status).toBe(400);
  });
});
