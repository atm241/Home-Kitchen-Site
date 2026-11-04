import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../config/database';
import { requireAuth } from '../middleware/auth';
import { importFromLink, ImportError } from '../services/linkImport';

// Phone share-sheet imports.
//
// iOS doesn't let home-screen web apps appear in the share menu, so iPhones
// use a Shortcut that POSTs the shared link here. The Shortcut can't log in,
// so it sends a long-lived "share key" instead of the normal session token.
// A share key can only import recipes; it can't read or change anything else.

const router = express.Router();

const KEY_PREFIX = 'sk_';
const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

// Does this user have a share key? (The key itself is never shown again.)
router.get('/key', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query('SELECT import_key_hash FROM users WHERE id = $1', [req.userId]);
  res.json({ hasKey: Boolean(result.rows[0]?.import_key_hash) });
});

// Create (or replace) this user's share key. Returned once, in plain text.
router.post('/key', requireAuth, async (req: Request, res: Response) => {
  const key = KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
  await pool.query('UPDATE users SET import_key_hash = $1 WHERE id = $2', [hashKey(key), req.userId]);
  res.status(201).json({ key });
});

router.delete('/key', requireAuth, async (req: Request, res: Response) => {
  await pool.query('UPDATE users SET import_key_hash = NULL WHERE id = $1', [req.userId]);
  res.json({ success: true });
});

async function requireShareKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!key.startsWith(KEY_PREFIX)) {
    return res.status(401).json({ error: 'Missing share key', message: 'Missing share key. Set it up again in the app.' });
  }
  const result = await pool.query(
    'SELECT id, household_id FROM users WHERE import_key_hash = $1',
    [hashKey(key)]
  );
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid share key', message: 'That share key no longer works. Make a new one in the app.' });
  }
  req.userId = result.rows[0].id;
  req.householdId = result.rows[0].household_id;
  next();
}

// The Shortcut sends { url } (or { text } from apps that share a message with
// a link inside). Every response includes a `message` the Shortcut can show
// as a notification as-is.
router.post('/import', requireShareKey, async (req: Request, res: Response) => {
  const shared = [req.body?.url, req.body?.text].find(v => typeof v === 'string' && v.trim());
  if (!shared) {
    return res.status(400).json({ error: 'Nothing was shared', message: 'Nothing was shared.' });
  }

  try {
    const result = await importFromLink(req.householdId!, shared);
    const recipe = await pool.query('SELECT id, name FROM recipes WHERE id = $1', [result.recipeId]);
    const name = recipe.rows[0]?.name || 'Recipe';
    res.status(result.duplicate ? 200 : 201).json({
      id: result.recipeId,
      name,
      duplicate: result.duplicate,
      message: result.duplicate ? `Already saved: ${name}` : `Saved: ${name}`,
    });
  } catch (error) {
    if (error instanceof ImportError) {
      return res.status(error.status).json({ error: error.message, message: error.message });
    }
    console.error('Share import failed:', error);
    res.status(500).json({ error: 'Import failed', message: "Couldn't save that recipe. Try again from the app." });
  }
});

export default router;
