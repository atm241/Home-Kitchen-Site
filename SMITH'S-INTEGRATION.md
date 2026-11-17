# Store prices (Smith's and other Kroger stores)

The grocery list can show what the unchecked items will cost at your store
before you go shopping, using real shelf prices from the official Kroger API.
It works for every Kroger-family store: Kroger, Smith's, Ralphs, Fred Meyer,
King Soopers, Fry's, QFC, and the rest. No AI is involved.

## Setup (one time, free)

1. Sign in at https://developer.kroger.com and create an application.
   - Environment: **Production**
   - API: **Products** (the Locations API comes with it)
   - Redirect URI: any placeholder, e.g. `http://localhost`. It isn't used,
     because the app uses the client-credentials flow.
2. Copy the client ID and client secret into `.env` at the repo root:
   ```
   KROGER_CLIENT_ID=...
   KROGER_CLIENT_SECRET=...
   ```
3. Restart the server: `docker compose up -d server`
4. In the app, open Grocery and tap **See store prices before you shop**,
   enter your ZIP code, and pick your store.

Without the two keys the feature stays hidden and nothing else changes.

## How the estimate works

- Each unchecked item's name is searched at your store. The first result
  whose description contains every word of the item wins, so "salt" doesn't
  match salted chips. If nothing contains every word, the first priced
  result is used.
- Sale prices are used when they're lower, and marked "sale".
- The estimate is **one package per item**, because package sizes rarely
  match recipe amounts. Treat it as a guide to whether the trip fits the
  budget, not as a quote. Hover or long-press a price to see which product
  it matched.
- Results are cached per store and item for 3 days, in the
  `kroger_price_cache` table, which all households share. A few lookups
  run at a time, well under Kroger's daily limits.

Code: `server/src/services/krogerService.ts`, `server/src/routes/stores.ts`,
`client/src/components/StorePrices/`.
