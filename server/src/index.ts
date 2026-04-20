import express, { Express, Request, Response, NextFunction } from 'express';
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
import recommendationRoutes from './routes/recommendations';

dotenv.config();

// Check Node version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0]);
if (majorVersion < 20) {
  console.error(`❌ Error: Node.js version ${nodeVersion} is not supported.`);
  console.error('This application requires Node.js version 20 or higher.');
  console.error('Please run: nvm use 20');
  process.exit(1);
}

const app: Express = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
}));
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
app.use('/api/recommendations', recommendationRoutes);

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Home Kitchen API' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  console.log(`Node version: ${process.versions.node}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
