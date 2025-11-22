# Home Kitchen - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  React Frontend                       │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐    │   │
│  │  │  Home  │  │Calendar│  │Recipes │  │ Pantry │    │   │
│  │  └────────┘  └────────┘  └────────┘  └────────┘    │   │
│  │  ┌────────┐                                          │   │
│  │  │Grocery │      React Router + TypeScript          │   │
│  │  └────────┘                                          │   │
│  │                  ↕ Axios API Calls                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
                         HTTP/JSON
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Express Backend                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  REST API                             │   │
│  │  /api/recipes    /api/calendar    /api/grocery       │   │
│  │  /api/pantry     /api/meals       /api/budget        │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ↕                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Business Logic                          │   │
│  │  • Recipe Scraper (cheerio)                          │   │
│  │  • Grocery List Generator                            │   │
│  │  • Budget Calculator                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ↕                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Database Layer (pg)                         │   │
│  │  Connection Pool → PostgreSQL                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
                          SQL Queries
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  recipes            ingredients     pantry            │   │
│  │  recipe_ingredients scheduled_meals grocery_list     │   │
│  │  calendar_events    grocery_prices  budgets          │   │
│  │  meal_portions                                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### 1. Importing a Recipe

```
User enters URL → Recipe URL Component
                         ↓
              POST /api/recipes/import
                         ↓
            Recipe Scraper Service
            (fetch HTML, parse JSON-LD)
                         ↓
         Extract: name, ingredients,
         instructions, nutrition
                         ↓
            INSERT INTO recipes
            INSERT INTO ingredients
            INSERT INTO recipe_ingredients
                         ↓
              Return recipe object
                         ↓
            Update UI with new recipe
```

### 2. Generating Grocery List

```
User clicks "Generate" → Grocery List Component
                         ↓
        POST /api/grocery/generate
        {week_start_date, week_end_date}
                         ↓
      SELECT scheduled_meals for week
                         ↓
     For each meal: get recipe ingredients
                         ↓
    Scale quantities by (servings / recipe_servings)
                         ↓
       Aggregate same ingredients
                         ↓
      SELECT pantry items
                         ↓
  Subtract pantry quantities from needed
                         ↓
       SELECT grocery_prices (Smith's)
                         ↓
  Calculate estimated cost per item
                         ↓
     INSERT INTO grocery_list
                         ↓
     Return complete shopping list
                         ↓
         Display on UI
```

### 3. Viewing Weekly Calendar

```
Home page loads → useEffect hook
                         ↓
     GET /api/calendar/combined
     ?start_date=2024-01-14
     &end_date=2024-01-20
                         ↓
    SELECT scheduled_meals
    UNION
    SELECT calendar_events
    WHERE date BETWEEN start AND end
                         ↓
     Return combined array
                         ↓
  Group by day, render in week grid
```

## Database Schema Relationships

```
┌─────────────┐
│   recipes   │───┐
└─────────────┘   │
                  │
    ┌─────────────┴──────────────┐
    │                            │
    ↓                            ↓
┌──────────────────┐    ┌─────────────────┐
│ recipe_          │    │ scheduled_meals │
│ ingredients      │    └─────────────────┘
└──────────────────┘             │
    │                            │
    ↓                            ↓
┌─────────────┐         ┌─────────────────┐
│ ingredients │────────→│  grocery_list   │
└─────────────┘         └─────────────────┘
    │
    ↓
┌─────────────┐
│   pantry    │
└─────────────┘
    │
    ↓
┌──────────────┐
│grocery_prices│
└──────────────┘
```

## Frontend Component Tree

```
App (Router)
├── Layout
│   ├── Header (Navigation)
│   └── Main Content
│       ├── Home
│       │   ├── Weekly Calendar Grid
│       │   ├── Budget Card
│       │   └── Quick Actions
│       ├── Calendar
│       │   ├── Month Navigation
│       │   └── Month Grid
│       ├── Recipes
│       │   ├── Import Form
│       │   └── Recipe Grid
│       ├── RecipeDetail
│       │   ├── Metadata
│       │   ├── Nutrition
│       │   ├── Ingredients List
│       │   └── Instructions
│       ├── Pantry
│       │   └── Category Cards
│       │       └── Item List
│       └── GroceryList
│           ├── Summary Stats
│           └── Category Cards
│               └── Item List (with checkboxes)
```

## API Endpoints Summary

### Recipes
- `GET /api/recipes` - List all
- `GET /api/recipes/:id` - Get one
- `POST /api/recipes` - Create
- `POST /api/recipes/import` - Import from URL
- `PUT /api/recipes/:id` - Update
- `DELETE /api/recipes/:id` - Delete
- `GET /api/recipes/filter/nutritional` - Filter by nutrition

### Calendar
- `GET /api/calendar` - Get events
- `GET /api/calendar/combined` - Get meals + events
- `POST /api/calendar` - Create event
- `PUT /api/calendar/:id` - Update event
- `DELETE /api/calendar/:id` - Delete event

### Meals
- `GET /api/meals` - Get scheduled meals
- `GET /api/meals/:id` - Get one meal
- `POST /api/meals` - Schedule meal
- `PUT /api/meals/:id` - Update meal
- `DELETE /api/meals/:id` - Delete meal
- `GET /api/meals/portions/:id` - Get meal portions

### Grocery
- `GET /api/grocery` - Get list for week
- `POST /api/grocery/generate` - Generate from meals
- `PATCH /api/grocery/:id/purchase` - Mark purchased
- `PUT /api/grocery/:id` - Update item
- `DELETE /api/grocery/:id` - Delete item
- `GET /api/grocery/prices` - Get prices
- `POST /api/grocery/prices` - Add/update price

### Pantry
- `GET /api/pantry` - Get all items
- `GET /api/pantry/staples` - Get staple items
- `POST /api/pantry` - Add item
- `PUT /api/pantry/:id` - Update item
- `DELETE /api/pantry/:id` - Remove item
- `POST /api/pantry/add-servings` - Record made meal
- `POST /api/pantry/consume-servings` - Record consumed

### Budget
- `GET /api/budget` - Get week budget
- `GET /api/budget/all` - Get all budgets
- `POST /api/budget` - Create/update budget
- `PATCH /api/budget/:date/actual` - Update actual cost
- `POST /api/budget/:date/recalculate` - Recalc estimate

### Ingredients
- `GET /api/ingredients` - List all
- `GET /api/ingredients/:id` - Get one
- `POST /api/ingredients` - Create
- `PUT /api/ingredients/:id` - Update
- `DELETE /api/ingredients/:id` - Delete

### Health Check
- `GET /api/health` - Check server + DB status

## Tech Stack Deep Dive

### Frontend
- **React 18**: Latest stable, with hooks
- **TypeScript**: Type safety throughout
- **React Router v6**: Client-side routing
- **Axios**: HTTP client with interceptors
- **date-fns**: Modern date library
- **CSS Modules**: Scoped styling

### Backend
- **Node.js**: JavaScript runtime
- **Express 5**: Web framework
- **TypeScript**: Compiled to JavaScript
- **pg**: PostgreSQL client
- **cheerio**: HTML parsing for scraping
- **axios**: HTTP client for fetching URLs
- **cors**: Cross-origin resource sharing
- **dotenv**: Environment variables

### Database
- **PostgreSQL 12+**: Relational database
- **Indexes**: On dates, names for performance
- **Constraints**: Foreign keys, unique constraints
- **Triggers**: Could add for updated_at timestamps

### Development Tools
- **nodemon**: Auto-restart server on changes
- **ts-node**: Run TypeScript directly
- **TypeScript Compiler**: Build production code
- **Create React App**: React tooling

## Deployment Considerations

### Frontend (Vercel/Netlify)
- Build: `npm run build`
- Serves static files
- Environment variable: `REACT_APP_API_URL`

### Backend (Railway/Heroku/Render)
- Build: `npm run build`
- Start: `npm start`
- Needs: DATABASE_URL environment variable

### Database (Railway/Heroku/Supabase)
- PostgreSQL hosted service
- Run schema.sql to initialize
- Backup strategy needed

## Security Considerations

### Current
- ✅ Parameterized SQL queries (SQL injection protection)
- ✅ CORS configured
- ✅ Environment variables for secrets
- ✅ TypeScript type safety

### TODO
- ❌ Rate limiting
- ❌ Input validation/sanitization
- ❌ Authentication/authorization
- ❌ HTTPS only in production
- ❌ API key encryption
- ❌ SQL query logging
- ❌ Error message sanitization

## Performance Optimizations

### Current
- ✅ Database indexes
- ✅ Connection pooling
- ✅ Batch inserts where possible

### Potential
- ❌ Redis caching for recipes
- ❌ React.memo for expensive components
- ❌ Image optimization/CDN
- ❌ Lazy loading routes
- ❌ Debouncing search inputs
- ❌ Pagination for large lists
- ❌ Database query optimization
- ❌ Bundle size reduction

## Scalability Notes

**Current limits:**
- Single PostgreSQL instance
- No caching layer
- No load balancing
- Synchronous processing

**To scale up:**
1. Add Redis for caching
2. Queue system for background jobs
3. Database replicas for reads
4. CDN for static assets
5. Microservices architecture (if really needed)

## Testing Strategy (TODO)

### Unit Tests
- API route handlers
- Recipe scraper
- Grocery list generator
- Date utilities

### Integration Tests
- API endpoints
- Database operations
- Full user flows

### E2E Tests
- Cypress for user journeys
- Recipe import → meal schedule → grocery list

## Monitoring (Future)

- Error tracking (Sentry)
- Performance monitoring (New Relic)
- Database metrics
- API response times
- User analytics

This is a solid foundation for a production application! 🚀
