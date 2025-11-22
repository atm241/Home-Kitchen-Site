#!/bin/bash

echo "🚀 Starting Home Kitchen Server..."

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if nvm is loaded
if ! command -v nvm &> /dev/null; then
    echo "❌ Error: nvm is not installed or not loaded"
    echo "Please install nvm first: https://github.com/nvm-sh/nvm"
    exit 1
fi

# Use Node 20
echo "📦 Switching to Node.js 20..."
nvm use 20

if [ $? -ne 0 ]; then
    echo "⚠️  Node 20 not installed. Installing now..."
    nvm install 20
    nvm use 20
fi

# Navigate to server directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/server"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# Display current versions
echo "✅ Node version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Start the server
echo "🏃 Starting development server..."
npm run dev
