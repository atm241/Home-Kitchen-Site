import * as dotenv from 'dotenv';
import { createApp } from './app';

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

// 5001 everywhere: docker-compose, nginx's proxy target, and the client's
// REACT_APP_API_URL all use it. The default matters when PORT is unset — a
// 5000 fallback would bind a port the client isn't calling, and every request
// would fail with a connection error that looks like the server is down.
const port = process.env.PORT || 5001;

const app = createApp();

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
