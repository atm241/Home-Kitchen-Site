# Development

How to run the server and client outside Docker while working on the code.
For normal use, run the Docker stack instead (see [README.md](README.md)).

> **Two separate databases.** The Docker stack keeps its data in the `pgdata`
> volume. Development mode, below, uses a separate local PostgreSQL. The real
> household data lives in **Docker**. Anything you create in dev mode stays
> in the dev database and never reaches the Docker app.

## Prerequisites

- Node.js 20 (`server/.nvmrc`; the server exits on older versions)
- PostgreSQL 15+ running locally, e.g. `brew install postgresql@15 && brew services start postgresql@15`

## One-time setup

```bash
createdb home_kitchen

cp server/.env.example server/.env    # set DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
cp client/.env.example client/.env    # REACT_APP_API_URL=http://localhost:5001/api

cd server && npm install
npm run init-db      # creates the schema from schema.sql
npm run migrate      # applies server/migrations/ (safe to re-run)
cd ../client && npm install
```

## Running

```bash
./start-server.sh            # switches to Node 20 with nvm, then runs the API on :5001
cd client && npm start       # dev server on :3000, reloads on save
```

Use `./stop-server.sh` to stop the API. Without the script:
`cd server && npm run dev`, or `npm run dev:watch` to restart on changes.
Check it's up with `curl http://localhost:5001/api/health`.

In dev mode, CORS defaults to `http://localhost:3000`. Set `CLIENT_URL` in
`server/.env` to open the dev client from your phone.

## Tests

Two suites, both run by GitHub Actions on every push (`.github/workflows/ci.yml`).
Neither can reach a paid API: test environments blank every key and point the
API addresses at nothing.

**Server API tests** (Vitest + Supertest, about 10 seconds). They run against a
throwaway PostgreSQL that's rebuilt from `schema.sql` and every migration on
each run, so a broken migration fails the suite too.

```bash
cd server
npm run test:db      # once per boot: a throwaway Postgres on port 5433
npm test             # or: npm run test:watch
```

They cover logins, household isolation (one household can never read,
change or reference another's data), transactions, AI caps, the budget, the
grocery list, store prices, rate limits and share keys. Add a test next to
the closest existing one in `server/tests/`, using the `signUp()` and
`createRecipe()` helpers.

**Browser tests** (Playwright: desktop Chrome and iPhone Safari, about 20
seconds). They drive the real UI against a full second copy of the Docker
stack on port 3100, with its own database and an invalid AI key. Your real
app on port 3000 isn't touched.

```bash
cd e2e
npm install && npx playwright install chromium webkit   # first time only
npm run stack:up     # build and start the test stack
npm test             # or: npm run test:ui to watch it click through
npm run stack:down   # remove the test stack and its data
```

`stack:down` only ever removes the `simmer-e2e` project. The real stack is
`homekitchensite`, and that name is pinned in `docker-compose.yml`.

**Client:** `cd client && CI=true npx react-scripts test --watchAll=false`.
There's one smoke test; the browser tests cover the UI.

## Checking your changes

Before committing:

```bash
cd server && npx tsc --noEmit && npm test
cd client && npx tsc --noEmit -p .
```

Then rebuild the Docker stack so the change is live:

```bash
docker compose up -d --build server client
```

Any new migration runs automatically when the server container starts. Look
for `Applied N migration(s)` in `docker compose logs server`.

## Useful scripts (in `server/`)

| Command | What it does |
|---|---|
| `npm run migrate -- --status` | List applied and pending migrations |
| `npm run reset-password -- you@example.com new-password` | Reset a password from the server (inside Docker: `docker compose exec server npm run reset-password -- ...`) |
| `npm run backfill-expiry` | Fill in missing pantry expiry dates from the shelf-life table |
| `node dist/scripts/normalizeExistingIngredients.js --dry-run` | Preview the AI cleanup of prose ingredient names in already-imported recipes (run inside the server container; drop `--dry-run` to apply) |

## Troubleshooting

- **The server exits immediately:** you're on a Node version older than 20.
  Run `nvm use 20`, or use `./start-server.sh`.
- **`nvm: command not found`:** load it with
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`, or add those lines to
  `~/.zshrc`.
- **Database connection errors:** check that PostgreSQL is running
  (`pg_isready`), and check `DATABASE_URL` in `server/.env`.
- **Every API call fails from a phone:** the address in the browser isn't
  listed in `CLIENT_URL`.
