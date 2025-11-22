import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err: Error) => {
  console.error('❌ Database connection error:', err.message);
  console.error('Full error:', err);
  // Don't exit immediately - let the application handle it gracefully
});

export default pool;
