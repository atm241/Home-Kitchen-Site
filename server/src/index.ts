import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as dotenv from 'dotenv';
import pool from './config/database';
import { UPLOADS_DIR, ensureUploadsDir } from './config/uploads';
import { requireAuth } from './middleware/auth';

// Import routes
import authRoutes from './routes/auth';
import recipeRoutes from './routes/recipes';
import ingredientRoutes from './routes/ingredients';
import pantryRoutes from './routes/pantry';
import mealRoutes from './routes/meals';
import groceryRoutes from './routes/grocery';
import calendarRoutes from './routes/calendar';
import budgetRoutes from './routes/budget';
import recommendationRoutes from './routes/recommendations';
import cookHistoryRoutes from './routes/cookHistory';
import plannerRoutes from './routes/planner';
import shareRoutes from './routes/share';

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
// 5001 everywhere: docker-compose, nginx's proxy target, and the client's
// REACT_APP_API_URL all use it. The default matters when PORT is unset — a
// 5000 fallback would bind a port the client isn't calling, and every request
// would fail with a connection error that looks like the server is down.
const port = process.env.PORT || 5001;

// In Docker, nginx is the only thing that talks to us, so without this every
// request looks like it comes from the proxy's IP — the rate limiters below
// would then count the whole household as one client and lock everyone out
// together. One hop: nginx.
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
}));

// Login and registration are the only unauthenticated, brute-forceable
// endpoints. Deliberately tight: a real person mistyping a password a few
// times stays well under this, while an automated guesser stalls immediately.
// Successful logins don't count, so getting it right doesn't burn the budget.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// Broad backstop for everything else. Generous enough that normal use never
// notices — it exists to blunt runaway clients and scripted scraping, not to
// police real usage.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
// Large limit so base64 photos (recipe images, receipts) fit in JSON bodies
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded recipe images are stored on disk and served statically
ensureUploadsDir();
app.use('/uploads', express.static(UPLOADS_DIR));

// Routes
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/recipes', requireAuth, recipeRoutes);
app.use('/api/ingredients', requireAuth, ingredientRoutes);
app.use('/api/pantry', requireAuth, pantryRoutes);
app.use('/api/meals', requireAuth, mealRoutes);
app.use('/api/grocery', requireAuth, groceryRoutes);
app.use('/api/calendar', requireAuth, calendarRoutes);
app.use('/api/budget', requireAuth, budgetRoutes);
app.use('/api/recommendations', requireAuth, recommendationRoutes);
app.use('/api/cook-history', requireAuth, cookHistoryRoutes);
app.use('/api/planner', requireAuth, plannerRoutes);
// Auth is per-route here: the Shortcut endpoint uses a share key, not a login.
app.use('/api/share', shareRoutes);

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
  res.json({ message: 'Simmer API' });
});

// Global error handler.
//
// The full error goes to the server log; the client gets a generic message.
// Internal error text tends to carry table names, file paths, and query
// fragments, and there's nothing a user can do with that anyway. In
// development the real message and stack come through so debugging still works.
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('❌ Unhandled error:', err);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { message: err.message, stack: err.stack }),
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
