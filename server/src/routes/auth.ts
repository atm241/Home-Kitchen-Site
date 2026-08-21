import express, { Request, Response } from 'express';
import pool from '../config/database';
import { hashPassword, comparePassword, signToken, generateInviteCode } from '../utils/auth';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// Create an account. If inviteCode is provided, join that household; otherwise create a new one.
router.post('/signup', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { email, password, name, householdName, inviteCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    await client.query('BEGIN');

    let householdId: number;
    if (inviteCode) {
      const household = await client.query('SELECT id FROM households WHERE invite_code = $1', [inviteCode]);
      if (household.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid invite code' });
      }
      householdId = household.rows[0].id;
    } else {
      const household = await client.query(
        'INSERT INTO households (name, invite_code) VALUES ($1, $2) RETURNING id',
        [householdName || `${name}'s Household`, generateInviteCode()]
      );
      householdId = household.rows[0].id;
    }

    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO users (household_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING id, household_id, email, name`,
      [householdId, email.toLowerCase(), passwordHash, name]
    );

    await client.query('COMMIT');

    const user = userResult.rows[0];
    const token = signToken({ userId: user.id, householdId: user.household_id });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error signing up:', error);
    res.status(500).json({ error: 'Failed to create account' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, household_id, email, name, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ userId: user.id, householdId: user.household_id });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// Change the logged-in user's password.
// Wrong current password returns 400 (not 401) so the client's global
// 401 interceptor doesn't log the user out mid-form.
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, h.id as household_id, h.name as household_name, h.invite_code
       FROM users u JOIN households h ON u.household_id = h.id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const row = result.rows[0];
    res.json({
      user: { id: row.id, email: row.email, name: row.name },
      household: { id: row.household_id, name: row.household_name, inviteCode: row.invite_code },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// List the members of the caller's household.
// Only ever exposes people who share a household with the caller.
router.get('/household/members', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE household_id = $1 ORDER BY name',
      [req.householdId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching household members:', error);
    res.status(500).json({ error: 'Failed to fetch household members' });
  }
});

// Reset another household member's password.
//
// This is the "I forgot my password" path for a self-hosted household app. A
// mailed reset link would need an SMTP server, which is a lot of setup for a
// household — so instead, someone else in the house who is already logged in
// does it for you. Everyone in a household already shares all the data, so this
// grants no access they didn't have; it only avoids an SSH session.
//
// The caller re-enters their OWN password: it stops a device left unlocked on
// the counter from being used to lock the owner out of their own account.
//
// If EVERY member is locked out at once, the fallback is still the CLI:
// `npm run reset-password` on the server. That case can't be solved in-app.
router.post('/household/members/:id/reset-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { newPassword, currentPassword } = req.body;

    if (Number.isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    if (!newPassword || !currentPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Use Change Password to update your own password' });
    }

    // Wrong password returns 400, not 401, so the client's global 401
    // interceptor doesn't log the caller out mid-form.
    const me = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (me.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await comparePassword(currentPassword, me.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Your password is incorrect' });
    }

    // Scoping the UPDATE by household_id as well as id means a forged member id
    // from another household matches zero rows instead of resetting a stranger.
    const updated = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 AND household_id = $3 RETURNING name',
      [await hashPassword(newPassword), targetId, req.householdId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'That person is not in your household' });
    }

    res.json({ success: true, name: updated.rows[0].name });
  } catch (error) {
    console.error('Error resetting member password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Regenerate the household's invite code (invalidates the old one)
router.post('/household/invite-code', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'UPDATE households SET invite_code = $1 WHERE id = $2 RETURNING invite_code',
      [generateInviteCode(), req.householdId]
    );
    res.json({ inviteCode: result.rows[0].invite_code });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

export default router;
