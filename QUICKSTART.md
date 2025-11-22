# Quick Start Guide

Follow these steps to get the Home Kitchen app running locally.

## Prerequisites

- PostgreSQL installed and running
- Node.js v16+ installed
- Basic familiarity with terminal/command line

## Step-by-Step Setup

### 1. Create the Database

```bash
# Open PostgreSQL command line
psql -U postgres

# Create the database (enter this in psql)
CREATE DATABASE home_kitchen;

# Exit psql
\q
```

### 2. Configure Database Connection

Edit `server/.env` file and update your PostgreSQL credentials:

```
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/home_kitchen
```

Replace `YOUR_USERNAME` and `YOUR_PASSWORD` with your PostgreSQL credentials.

### 3. Initialize Database Schema

```bash
cd server
npm run init-db
```

You should see: "✅ Database initialized successfully!"

### 4. Install Dependencies

```bash
# Install server dependencies (if not already done)
npm install

# Install client dependencies
cd ../client
npm install
```

### 5. Start the Backend Server

```bash
cd ../server
npm run dev
```

You should see: "⚡️[server]: Server is running at http://localhost:5000"

### 6. Start the Frontend (in a new terminal)

```bash
cd client
npm start
```

The app should automatically open at http://localhost:3000

## First Steps in the App

1. **Import a Recipe**
   - Go to "Recipes" page
   - Enter a recipe URL (try allrecipes.com, foodnetwork.com, etc.)
   - Click "Import"

2. **View Your Week**
   - Go back to "Home" to see the weekly calendar
   - Currently empty since you haven't scheduled meals yet

3. **Schedule a Meal** (Coming in future update)
   - Click on a calendar day
   - Select a recipe and servings
   - Save the meal

4. **Generate Grocery List**
   - After scheduling meals, go to "Grocery List"
   - Click "Generate from Meals"
   - Your shopping list will be created automatically

## Common Issues

### "Database connection failed"
- Make sure PostgreSQL is running: `pg_isready`
- Check your credentials in `server/.env`
- Verify the database exists: `psql -U postgres -l | grep home_kitchen`

### "Port 5000 already in use"
- Change PORT in `server/.env` to a different number (e.g., 5001)
- Restart the server

### "Recipe import failed"
- Some websites block automated scraping
- Try a different recipe URL
- Check that the URL is valid and accessible

## Testing the Database Connection

You can test if everything is set up correctly:

```bash
curl http://localhost:5000/api/health
```

Should return: `{"status":"ok","database":"connected"}`

## Next Steps

Check out the full [README.md](README.md) for:
- Complete API documentation
- Project structure details
- Future enhancement plans
- Contributing guidelines

## Need Help?

- Database issues: Check PostgreSQL logs
- Server issues: Check terminal output where server is running
- Client issues: Check browser console (F12)

Happy cooking! 👨‍🍳
