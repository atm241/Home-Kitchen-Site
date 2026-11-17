// The household's grocery store and shelf-price estimates for the list.
import express, { Request, Response } from 'express';
import pool from '../config/database';
import { KrogerError, findStores, krogerConfigured, priceItems } from '../services/krogerService';

const router = express.Router();

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof KrogerError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

async function householdStore(householdId: number) {
  const result = await pool.query(
    'SELECT kroger_location_id, kroger_store_name FROM households WHERE id = $1',
    [householdId]
  );
  const row = result.rows[0];
  return row?.kroger_location_id ? { locationId: row.kroger_location_id as string, name: row.kroger_store_name as string } : null;
}

// Whether store prices are available, and which store this household uses.
router.get('/status', async (req: Request, res: Response) => {
  try {
    res.json({ configured: krogerConfigured(), store: await householdStore(req.householdId!) });
  } catch (error) {
    sendError(res, error, 'Failed to load store settings');
  }
});

router.get('/search', async (req: Request, res: Response) => {
  const zip = String(req.query.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code' });
  try {
    res.json(await findStores(zip));
  } catch (error) {
    sendError(res, error, 'Failed to search stores');
  }
});

router.put('/mine', async (req: Request, res: Response) => {
  const { locationId, name } = req.body || {};
  if (typeof locationId !== 'string' || !/^[0-9A-Za-z]{1,20}$/.test(locationId)) {
    return res.status(400).json({ error: 'Invalid store' });
  }
  const storeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : 'My store';
  try {
    await pool.query(
      'UPDATE households SET kroger_location_id = $1, kroger_store_name = $2 WHERE id = $3',
      [locationId, storeName, req.householdId]
    );
    res.json({ store: { locationId, name: storeName } });
  } catch (error) {
    sendError(res, error, 'Failed to save store');
  }
});

router.delete('/mine', async (req: Request, res: Response) => {
  try {
    await pool.query(
      'UPDATE households SET kroger_location_id = NULL, kroger_store_name = NULL WHERE id = $1',
      [req.householdId]
    );
    res.json({ store: null });
  } catch (error) {
    sendError(res, error, 'Failed to clear store');
  }
});

// Estimated cost of what's still unchecked on this week's list: one package
// of the best-matching product per item, at the household's store. A rough
// guide for staying on budget, not a quote — package sizes rarely line up
// with recipe amounts.
router.get('/estimate', async (req: Request, res: Response) => {
  const week = String(req.query.week_start_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week_start_date is required' });
  try {
    const store = await householdStore(req.householdId!);
    if (!krogerConfigured() || !store) return res.json({ store, total: 0, items: [] });

    const list = await pool.query(
      `SELECT gl.id, i.name FROM grocery_list gl JOIN ingredients i ON i.id = gl.ingredient_id
       WHERE gl.household_id = $1 AND gl.week_start_date = $2 AND NOT COALESCE(gl.is_purchased, false)
       ORDER BY i.name`,
      [req.householdId, week]
    );
    const priced = await priceItems(store.locationId, list.rows);
    const total = priced.reduce((sum, item) => sum + (item.match?.price ?? 0), 0);
    res.json({
      store,
      total: Math.round(total * 100) / 100,
      items: priced.map((item) => ({
        id: item.id,
        name: item.name,
        product: item.match?.description ?? null,
        size: item.match?.size ?? null,
        price: item.match?.price ?? null,
        regular_price: item.match?.regularPrice ?? null,
      })),
    });
  } catch (error) {
    sendError(res, error, 'Failed to estimate prices');
  }
});

export default router;
