import express, { Request, Response } from 'express';
import pool from '../config/database';

const router = express.Router();

// Get all calendar events
router.get('/', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    let query = 'SELECT * FROM calendar_events WHERE household_id = $1';
    const params: any[] = [req.householdId];

    if (start_date) {
      params.push(start_date);
      query += ` AND event_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND event_date <= $${params.length}`;
    }

    query += ' ORDER BY event_date ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// Get combined calendar view (meals + events)
router.get('/combined', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const params: any[] = [req.householdId];
    const conditions: string[] = [];

    if (start_date) {
      params.push(start_date);
      conditions.push(`date >= $${params.length}`);
    }

    if (end_date) {
      params.push(end_date);
      conditions.push(`date <= $${params.length}`);
    }

    const extraWhere = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        'meal' as type,
        sm.id,
        sm.meal_date as date,
        sm.meal_type,
        r.name as title,
        sm.servings,
        sm.notes,
        sm.recipe_id,
        CASE
          WHEN r.calories IS NOT NULL AND r.servings > 0
          THEN ROUND((r.calories::numeric / r.servings) * sm.servings)
          ELSE NULL
        END as calories
      FROM scheduled_meals sm
      JOIN recipes r ON sm.recipe_id = r.id
      WHERE sm.household_id = $1${extraWhere.replace(/date/g, 'sm.meal_date')}

      UNION ALL

      SELECT
        'event' as type,
        ce.id,
        ce.event_date as date,
        ce.meal_type,
        ce.title,
        NULL as servings,
        ce.notes,
        NULL as recipe_id,
        NULL as calories
      FROM calendar_events ce
      WHERE ce.household_id = $1${extraWhere.replace(/date/g, 'ce.event_date')}

      ORDER BY date ASC, meal_type ASC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching combined calendar:', error);
    res.status(500).json({ error: 'Failed to fetch combined calendar' });
  }
});

// Create calendar event
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, event_date, event_type, meal_type, notes } = req.body;

    const result = await pool.query(`
      INSERT INTO calendar_events (household_id, title, event_date, event_type, meal_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.householdId, title, event_date, event_type, meal_type, notes]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating calendar event:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// Update calendar event
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const { title, event_date, event_type, meal_type, notes } = req.body;

    const result = await pool.query(`
      UPDATE calendar_events
      SET title = $1, event_date = $2, event_type = $3, meal_type = $4, notes = $5
      WHERE id = $6 AND household_id = $7
      RETURNING *
    `, [title, event_date, event_type, meal_type, notes, id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating calendar event:', error);
    res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

// Delete calendar event
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM calendar_events WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Calendar event deleted successfully' });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

export default router;
