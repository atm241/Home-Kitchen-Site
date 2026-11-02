# Simmer (formerly Home Kitchen)

Save the cooking videos you scroll past as real recipes. Paste or share a TikTok, YouTube or Instagram link and Simmer turns the creator's caption (and YouTube's transcript) into a clean recipe with ingredients, steps and times. Planning, pantry tracking, grocery lists and budgets are built in around your cookbook.

## TODO
- Export Grocery List to phone notes

## Features

- **Video recipe import**: Paste a TikTok, YouTube or Instagram link (or any recipe website) and get a structured recipe. If the caption links to the creator's blog, that page is used for exact amounts. Instagram is best effort unless `INSTAGRAM_OEMBED_TOKEN` is set.
- **Save from your phone**: Android installs the app into the share menu. iPhone uses a Shortcut with a per-user share key (set up under Account → Save from your phone).
- **Cook mode**: Full-screen, one step at a time, keeps the screen awake, and offers timers for steps that mention a time.
- **Pantry match**: Every recipe shows how many of its ingredients you already have, with one tap to add the missing ones to your grocery list.
- **Accounts & Households**: Email/password accounts; each household's data (pantry, recipes, budgets, etc.) is fully isolated. Invite others to your household with a shareable code (see Layout's "Account" menu).
- **Recipe Management**: Import recipes from URLs, view nutritional information, and manage your recipe collection
- **Weekly Calendar**: View your meals for the week on the home screen
- **Full Month Calendar**: Plan meals and events for the entire month
- **Pantry Tracking**: Keep track of ingredients you have, including staples, quantities, and expiration dates
- **Barcode Scanning**: Scan a product barcode with your phone/laptop camera to prefill a pantry item (via the free Open Food Facts database)
- **Receipt Scanning**: Photograph a grocery receipt and have AI extract line items straight into your pantry
- **Grocery List**: Auto-generate shopping lists from scheduled meals with estimated costs
- **Budget Tracking**: Set weekly/monthly budgets and track estimated vs actual costs
- **Nutritional Filtering**: Find recipes based on nutritional goals (low-carb, high-protein, etc.)

## Hosting

This app is designed to run three ways from the same codebase:

1. **Self-hosted (e.g. a Raspberry Pi)**: `docker-compose up` on your own hardware. Your household's data never leaves your network. See [docker-compose.yml](docker-compose.yml) and [SELF-HOSTING.md](SELF-HOSTING.md) (includes how to reach it from your phone away from home, and installing it as a home-screen app).
2. **Cloud-hosted by you**: deploy the same Docker images to any VPS/cloud provider. The app is already multi-tenant (households + accounts), so multiple people can sign up on one instance without seeing each other's data.
3. **Hosted for a fee**: since the app is multi-tenant, the same deployment can serve paying customers as separate households — no per-customer infrastructure needed.

New installs get the full schema (including accounts/households) from [server/schema.sql](server/schema.sql). Existing installs upgrading from an older version should run the files in [server/migrations/](server/migrations/) in order — in particular `003_add_auth_and_households.sql` (accounts) and `008_video_imports.sql` (video sources and phone share keys). 003 adds accounts and folds all pre-existing data into a "My Household" account (check the server logs or query the `households` table for its invite code after migrating).

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
JWT_SECRET=generate_with_openssl_rand_base64_48
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

### Auth
- `POST /api/auth/signup` - Create an account (optionally join a household via `inviteCode`)
- `POST /api/auth/login` - Log in, returns a JWT
- `GET /api/auth/me` - Get the current user + household (requires `Authorization: Bearer <token>`)
- `POST /api/auth/household/invite-code` - Regenerate the household's invite code

All other endpoints below require the `Authorization: Bearer <token>` header and are scoped to the caller's household.

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
