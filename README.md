# Home Kitchen - Recipe & Meal Planning App

A React-based meal planning application that helps you manage recipes, schedule meals, track your pantry, and generate grocery lists within your weekly budget.

## Features

- **Recipe Management**: Import recipes from URLs, view nutritional information, and manage your recipe collection
- **Weekly Calendar**: View your meals for the week on the home screen
- **Full Month Calendar**: Plan meals and events for the entire month
- **Pantry Tracking**: Keep track of ingredients you have, including staples and quantities
- **Grocery List**: Auto-generate shopping lists from scheduled meals with estimated costs
- **Budget Tracking**: Set weekly budgets and track estimated vs actual costs
- **Nutritional Filtering**: Find recipes based on nutritional goals (low-carb, high-protein, etc.)

## Tech Stack

- **Frontend**: React with TypeScript
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **Styling**: CSS Modules with custom color scheme

## Color Scheme

- Background: `#EBD5AB` (Warm beige)
- Primary: `#E67E22` (Orange)
- Secondary: `#628141` (Dark green)
- Accent: `#8BAE66` (Light green)

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

### 1. Clone the repository

```bash
cd "Home Kitchen Site"
```

### 2. Set up the database

Create a PostgreSQL database:

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE home_kitchen;

# Exit psql
\q
```

Run the schema:

```bash
psql -U postgres -d home_kitchen -f server/schema.sql
```

### 3. Configure environment variables

Create a `.env` file in the `server` directory:

```bash
cd server
cp .env.example .env
```

Edit `.env` and update with your database credentials:

```
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/home_kitchen
SPOONACULAR_API_KEY=your_api_key_here
```

### 4. Install dependencies

Install server dependencies:

```bash
cd server
npm install
```

Install client dependencies:

```bash
cd ../client
npm install
```

### 5. Start the application

Start the backend server (from the `server` directory):

```bash
npm run dev
```

Start the frontend (from the `client` directory, in a new terminal):

```bash
npm start
```

The application should now be running:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Usage Guide

### Importing Recipes

1. Go to the **Recipes** page
2. Enter a recipe URL in the import field
3. Click "Import" - the app will automatically scrape and parse the recipe

### Scheduling Meals

1. Go to the **Calendar** page
2. Click on a day to add a meal
3. Select a recipe and number of servings
4. Optionally set it as recurring

### Generating Grocery Lists

1. Schedule your meals for the week
2. Go to the **Grocery List** page
3. Click "Generate from Meals"
4. The app will create a shopping list based on your scheduled meals
5. It automatically accounts for items in your pantry

### Managing Your Pantry

1. Go to the **Pantry** page
2. View ingredients organized by category
3. Mark items as staples (like olive oil, butter) so they're always accounted for

### Budget Tracking

- Set your weekly budget on the home page
- View estimated costs based on your grocery list
- Track actual spending vs budget

## Project Structure

```
Home Kitchen Site/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service layer
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utility functions
│   └── public/
├── server/                # Node/Express backend
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   └── config/       # Configuration
│   └── schema.sql        # Database schema
└── README.md
```

## API Endpoints

### Recipes
- `GET /api/recipes` - Get all recipes
- `POST /api/recipes` - Create a recipe
- `POST /api/recipes/import` - Import from URL
- `GET /api/recipes/:id` - Get single recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe

### Calendar
- `GET /api/calendar/combined` - Get meals and events
- `POST /api/calendar` - Create calendar event

### Meals
- `GET /api/meals` - Get scheduled meals
- `POST /api/meals` - Schedule a meal

### Grocery
- `GET /api/grocery` - Get grocery list
- `POST /api/grocery/generate` - Generate from meals
- `PATCH /api/grocery/:id/purchase` - Mark as purchased

### Pantry
- `GET /api/pantry` - Get pantry items
- `POST /api/pantry` - Add pantry item

### Budget
- `GET /api/budget` - Get weekly budget
- `POST /api/budget` - Create/update budget

## Future Enhancements

- **Smith's Price Integration**: Currently uses manual price entry. Will add web scraping or API integration for automatic price updates
- **Recipe Filtering**: Enhanced filtering by nutritional goals and dietary restrictions
- **Meal Portions**: Better tracking of leftovers and partial servings
- **Multi-user Support**: User authentication and separate accounts
- **Mobile App**: Native mobile version for grocery shopping
- **Recipe Suggestions**: AI-powered meal recommendations based on budget and preferences

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `psql -U postgres -c "SELECT 1"`
- Check your DATABASE_URL in `.env`
- Ensure the database exists: `psql -U postgres -l`

### Port Already in Use
- Change the PORT in `server/.env`
- Update the API_URL in client if needed

### Recipe Import Fails
- Some websites block scraping - this is normal
- Try a different recipe URL
- Check the website's structure hasn't changed

## Contributing

This is a personal project, but suggestions are welcome! Please open an issue to discuss any changes.

## License

MIT
