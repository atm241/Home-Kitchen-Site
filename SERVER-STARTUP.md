# Server Startup Guide

## Quick Start

Simply run the startup script from the project root:

```bash
./start-server.sh
```

This will:
- ✅ Automatically switch to Node.js 20
- ✅ Install Node 20 if not already installed
- ✅ Check and install dependencies if needed
- ✅ Display version information
- ✅ Start the development server

## Manual Startup

If you prefer to run manually:

```bash
# Navigate to server directory
cd server

# Make sure you're using Node 20
nvm use 20

# Start the server
npm run dev
```

## Automatic Node Version Switching

The `server/.nvmrc` file tells nvm to use Node 20 automatically. After restarting your terminal, just `cd` into the server directory and nvm will switch versions automatically (if you've configured auto-loading in your shell).

## Troubleshooting

### Server exits immediately

**Problem**: You're using Node v18 instead of Node v20.

**Solution**: Run `nvm use 20` before starting the server, or use the `./start-server.sh` script which does this automatically.

### "nvm: command not found"

**Problem**: nvm isn't loaded in your shell.

**Solution**: 
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Or restart your terminal after ensuring nvm is in your `~/.zshrc` file.

### Database connection errors

**Problem**: PostgreSQL isn't running.

**Solution**:
```bash
# Check if PostgreSQL is running
psql -U piercegruidl -d home_kitchen -c "SELECT 1;"

# If not, start it (macOS with Homebrew)
brew services start postgresql@15
```

## What You Should See

When the server starts successfully:

```
🚀 Starting Home Kitchen Server...
📦 Switching to Node.js 20...
Now using node v20.19.5 (npm v10.8.2)
✅ Node version: v20.19.5
✅ npm version: 10.8.2

🏃 Starting development server...
⚡️[server]: Server is running at http://localhost:5000
Node version: 20.19.5
Environment: development
```

The server is now running and listening on port 5000!
