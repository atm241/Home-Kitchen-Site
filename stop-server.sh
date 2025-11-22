#!/bin/bash

echo "🛑 Stopping Home Kitchen Server..."

# Find and kill the process running on port 5000
PORT_PID=$(lsof -ti:5000)

if [ -z "$PORT_PID" ]; then
    echo "ℹ️  No server running on port 5000"
else
    echo "📍 Found server process on port 5000 (PID: $PORT_PID)"
    kill -9 $PORT_PID
    echo "✅ Server stopped successfully"
fi

# Also kill any ts-node processes running the server
TS_NODE_PIDS=$(pgrep -f "ts-node.*index.ts")

if [ -n "$TS_NODE_PIDS" ]; then
    echo "📍 Found additional ts-node processes: $TS_NODE_PIDS"
    echo "$TS_NODE_PIDS" | xargs kill -9 2>/dev/null
    echo "✅ Additional processes stopped"
fi

# Kill any npm run dev processes
NPM_PIDS=$(pgrep -f "npm run dev")

if [ -n "$NPM_PIDS" ]; then
    echo "📍 Found npm processes: $NPM_PIDS"
    echo "$NPM_PIDS" | xargs kill -9 2>/dev/null
    echo "✅ npm processes stopped"
fi

echo "🏁 All server processes stopped"
