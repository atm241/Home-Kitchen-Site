# Simmer

Save the cooking videos you scroll past as real recipes. Paste or share a
TikTok, YouTube or Instagram link, or any recipe website, and Simmer turns it
into a clean recipe with ingredients, steps and times. Meal planning, a
pantry, a grocery list and a receipt-based food budget are built around that
cookbook.

Simmer is self-hosted: it runs in Docker on your own machine, and your
household's data stays there.

## Features

- **Import from anywhere.** Video links use the creator's caption, plus
  YouTube's transcript when there is one. If the caption links to the
  creator's blog, that page's exact amounts are used instead. Recipe
  websites are read from their structured recipe data. Instagram is best
  effort unless `INSTAGRAM_OEMBED_TOKEN` is set.
- **Snap a recipe.** Photograph a cookbook page, a handwritten card or a
  screenshot, and it's transcribed into an editable recipe.
- **Save from your phone's share menu.** On Android, installing the app adds
  it to the share menu. On iPhone it's a Shortcut with a per-user share key,
  set up under Account → Save from your phone.
- **Cookbook.** Search recipes and ingredients, filter by favorites, under
  30 minutes, from videos, or "make with what I have". Every recipe shows
  how much of it your pantry covers.
- **Cook mode.** Full screen, one step at a time. It keeps the screen awake
  and offers timers for steps that mention a time. Mark a recipe as made on
  its page to keep a cooking history.
- **Plan.** Schedule recipes on a weekly plan and a month calendar, or let the
  auto-planner build a plan from your cookbook around calorie and macro goals.
- **Grocery list.** Build it from the week's plan, minus what's in your pantry.
  Check items off at the store (there's a simplified shopping mode), copy
  the list to paste into Notes, and move purchased items into the pantry.
  Optionally shows real shelf prices from your store (see
  [SMITH'S-INTEGRATION.md](SMITH'S-INTEGRATION.md)).
- **Pantry.** Track quantities and expiry dates (filled in automatically from
  a shelf-life table), scan barcodes, and see "use it up" suggestions for
  items about to expire.
- **Budget.** One food budget, fed by receipt *totals*. Scan a receipt, or
  just type the total. Spending is subtracted from a rolling budget window
  that's shown on the Plan, Calendar and Grocery pages.
- **Households.** Email and password accounts. Everyone in a household shares
  one cookbook, pantry and list. Others join with the household's invite
  code, and each household's data is fully separate from the others.
- **Works offline at the store.** Installed as an app over HTTPS, it keeps the
  last-loaded grocery list, recipes and pantry readable without a signal.

## Quick start (Docker)

```bash
cp .env.example .env        # then fill in the values (see below)
docker compose up -d --build
```

Open `http://<this machine's IP>:3000` and sign up. The first account creates
a household, and the invite code for others is in the Account menu.
Database migrations run automatically every time the server starts.

| `.env` key | Required | What it's for |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Database password |
| `JWT_SECRET` | yes | Signs logins. Generate with `openssl rand -base64 48` |
| `ANTHROPIC_API_KEY` | yes | Video, photo and receipt imports (Claude) |
| `CLIENT_URL` | yes | Every address you open the app from, separated by commas, e.g. `http://192.168.1.50:3000,https://kitchen.tail1234.ts.net`. Requests from any other address are rejected |
| `SPOONACULAR_API_KEY` | no | Recipe and ingredient-combo recommendations |
| `INSTAGRAM_OEMBED_TOKEN` | no | Reliable Instagram imports |
| `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` | no | Store-price estimates on the grocery list |
| `AI_DAILY_LIMIT_VIDEO` / `_PHOTO` / `_RECEIPT` | no | Per-household daily caps on AI imports (defaults 25 / 20 / 30; `0` turns one off) |
| `VIDEO_IMPORT_MODEL` | no | Claude model for video imports (default `claude-sonnet-5-5`) |

## Documentation

- [SELF-HOSTING.md](SELF-HOSTING.md): running it on your own hardware,
  reaching it from your phone away from home (Tailscale), installing it as an
  app, backups, forgotten passwords.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit, where AI is used and
  what it costs, and the data model.
- [DEVELOPMENT.md](DEVELOPMENT.md): running the server and client outside
  Docker while working on the code.
- [SMITH'S-INTEGRATION.md](SMITH'S-INTEGRATION.md): setting up store prices
  from Kroger-family stores.

## Tech stack

React 19 + TypeScript (Create React App, CSS Modules), served by nginx ·
Node 20 + Express 5 + TypeScript · PostgreSQL 16 · Claude (Anthropic API) for
imports · Docker Compose.

## License

MIT
