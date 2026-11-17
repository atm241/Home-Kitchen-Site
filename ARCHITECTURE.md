# Architecture

## The pieces

```
 Phone / browser
      │  https://<machine>.<tailnet>.ts.net  (Tailscale Serve, optional)
      │  or http://<LAN IP>:3000
      ▼
┌──────────────────────── docker compose ────────────────────────┐
│  client   nginx :80 → host :3000                               │
│           serves the React build, proxies /api and /uploads    │
│               │                                                │
│  server   Express :5001 (not exposed to the host)              │
│           runs migrate.js, then dist/index.js                  │
│               │                       volume: uploads (photos) │
│  db       PostgreSQL 16               volume: pgdata           │
└────────────────────────────────────────────────────────────────┘
      │ outbound only
      ▼
 Anthropic API · Kroger API · Spoonacular · Open Food Facts · video sites
```

The browser only ever talks to nginx, so the API is same-origin in normal use.
`CLIENT_URL` (comma-separated) is the CORS allow-list for anything else.

## Server layout (`server/src`)

`index.ts` sets up CORS and rate limits, and mounts every route group under
`/api`. Everything except `/api/auth` and the share-key Shortcut endpoint
requires a login, and every query is scoped to the caller's household.

| Route group | What it does |
|---|---|
| `auth` | Sign up (new household, or join one with an invite code), log in, members, password reset by another member, invite codes |
| `recipes` | CRUD, link import (single and bulk), photo parsing, image upload, favorites, pantry match |
| `share` | Per-user share keys, and the endpoint the iPhone Shortcut posts links to |
| `planner` | Budget and nutrition goals, budget status, the auto-planner (generate, evaluate, alternatives, commit) |
| `meals`, `calendar` | Scheduled meals and other calendar events |
| `grocery` | The weekly list: build from meals, manual items, check off, move to pantry |
| `stores` | Kroger store choice and shelf-price estimates for the list |
| `pantry` | Pantry items, barcode lookup, suggested expiry, use-it-up, receipt scanning |
| `budget` | Receipt totals (`grocery_receipts`) and the older weekly/monthly budget endpoints, still used for spending history |
| `cook-history`, `recommendations`, `ingredients` | What was cooked when, Spoonacular suggestions, the ingredient table |

Services worth knowing:

- `linkImport.ts` is the entry point for every shared link. It normalizes the
  URL, returns the existing recipe if the link was saved before, then either
  scrapes a recipe website (`recipeScraper.ts`, schema.org JSON-LD) or hands
  off to `videoRecipeImporter.ts`.
- `videoRecipeImporter.ts` fetches the caption and transcript, prefers a
  recipe page linked from the caption, and otherwise asks Claude to structure
  the text. Thumbnails are downloaded into `uploads/`, because social image
  URLs expire.
- `mealPlanner.ts` is the auto-planner. It plans only from the household's
  own cookbook and uses the budget only to favor shorter shopping lists.
- `aiQuota.ts` enforces the per-household daily caps on AI imports.
- `krogerService.ts` handles the Kroger token, store search and product
  prices, with a shared 3-day price cache.

## Where AI is used, and what it costs

Every call goes to the Anthropic API with the server's `ANTHROPIC_API_KEY`.
Costs are rough per-use figures at current prices.

| Call | Model | When it runs | Cost per use |
|---|---|---|---|
| Video recipe import | `claude-sonnet-5-5` (`VIDEO_IMPORT_MODEL`) | Video links whose caption doesn't link a recipe page | ~1–3¢ |
| Recipe photo | `claude-haiku-5-5` | Each photo on Add Recipe | ~0.1¢ |
| Receipt scan | `claude-haiku-5-5` | Each receipt photo (typing the total instead is free) | under 0.1¢ |
| Ingredient cleanup | `claude-haiku-5-5` | Scraped recipe pages (a website, or a page linked from a video) whose ingredient lines still read like prose | ~0.1¢ |
| Ingredient category | `claude-haiku-5-5` | A new ingredient name that no household has categorized yet | ~0.001¢ |
| Recipe category | `claude-haiku-5-5` | Each website or video import | ~0.001¢ |

Guard rails:

- **Daily caps.** Video imports, photo scans and receipt scans are capped per
  household per rolling 24 hours (25 / 20 / 30 by default; override with
  `AI_DAILY_LIMIT_*`). Every attempt is logged in `ai_usage` before the call
  is made.
- **Caching.** Ingredient categories are reused from the `ingredients` table
  and an in-memory cache, so a common name is only ever sent once.
- **Fallbacks.** Categorizing and ingredient cleanup fall back to keyword
  rules, or keep the original text, if the API key is missing or a call
  fails. Imports never break because of them. Video, photo and receipt
  imports need the API. When the key is invalid or the account is out of
  credits, the user sees a plain message saying so.

## Data model

Every table has a `household_id`, except the shared reference tables marked
"shared" below.

- **People:** `households` (invite code, chosen Kroger store), `users`.
- **Cookbook:** `recipes` (source URL, platform, author, nutrition, favorite),
  `ingredients` (unique per household by name, with category),
  `recipe_ingredients`, `cook_history`.
- **Planning:** `scheduled_meals`, `meal_portions`, `calendar_events`,
  `meal_plan_preferences` (budget amount and start date, period length,
  calorie and macro goals).
- **Shopping:** `grocery_list`, `grocery_receipts` (receipt totals that feed
  the budget), `kroger_price_cache` (shared by all households),
  `grocery_prices` (legacy manual prices, unused).
- **Pantry:** `pantry`, `shelf_life` (shared default expiry rules).
- **Budget history (legacy):** `budgets` (weekly) and `monthly_budgets`. The
  live budget is `meal_plan_preferences` plus `grocery_receipts`, computed
  as a rolling window in `budgetStatus()` in `routes/planner.ts`.
- **Plumbing:** `ai_usage`, `cached_recipe_recommendations`,
  `cached_ingredient_combos`, `schema_migrations`.

**Schema changes:** a new database is created from `server/schema.sql`, and
then every file in `server/migrations/` is applied in order by `migrate.js`,
which runs on every server start. Applied files are recorded in
`schema_migrations`, and migrations are written with `IF NOT EXISTS`, so
re-running them is safe. To change the schema, add a new numbered migration
file. Don't edit an applied one.

## Security

- Passwords are hashed with bcrypt (cost 12). Logins are JWTs signed with
  `JWT_SECRET`.
- Rate limits: 10 failed logins per 15 minutes per client, and 1000 API
  requests per 15 minutes per client. nginx is the one trusted proxy, so
  each person is counted separately rather than the whole household as one.
- Every query is parameterized and scoped to the caller's household. Error
  responses don't include internal details outside development mode.
- The iPhone Shortcut authenticates with a revocable per-user share key, not
  the account password.
- Over Tailscale, nothing is exposed to the public internet. A public
  deployment needs more hardening; see [SELF-HOSTING.md](SELF-HOSTING.md).

## Offline behavior

The client is a PWA (Create React App + Workbox, `client/src/service-worker.ts`).
The app itself is cached. API GET requests are network-first, with a 5-second
timeout, falling back to the last cached response (kept 7 days). In a dead
zone at the store, the list, recipes and pantry stay readable, but changes
need a connection. Service workers only run over HTTPS, so this needs the
Tailscale (or another HTTPS) address, not a plain LAN IP.
