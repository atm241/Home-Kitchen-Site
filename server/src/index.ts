import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import pool from './config/database';

// Import routes
import recipeRoutes from './routes/recipes';
import ingredientRoutes from './routes/ingredients';
import pantryRoutes from './routes/pantry';
import mealRoutes from './routes/meals';
import groceryRoutes from './routes/grocery';
import calendarRoutes from './routes/calendar';
import budgetRoutes from './routes/budget';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/recipes', recipeRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/pantry', pantryRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/grocery', groceryRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/budget', budgetRoutes);

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', error });
  }
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Home Kitchen API' });
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

export default app;
