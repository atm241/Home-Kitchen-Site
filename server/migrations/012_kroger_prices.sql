-- Store-price estimates from the Kroger API (Kroger, Smith's, Ralphs, Fred
-- Meyer, King Soopers and other Kroger banners).

-- The store each household shops at. Prices are per store, so this picks
-- which shelf prices the grocery list estimate uses.
ALTER TABLE households ADD COLUMN IF NOT EXISTS kroger_location_id VARCHAR(20);
ALTER TABLE households ADD COLUMN IF NOT EXISTS kroger_store_name VARCHAR(200);

-- Shelf prices are the same for everyone shopping a given store, so the
-- cache is shared across households and keyed by store + search term.
-- A row with a NULL price records "no match" so it isn't searched again
-- right away.
CREATE TABLE IF NOT EXISTS kroger_price_cache (
    location_id VARCHAR(20) NOT NULL,
    term VARCHAR(200) NOT NULL,
    product_id VARCHAR(30),
    description VARCHAR(300),
    size VARCHAR(100),
    price NUMERIC(10, 2),
    promo_price NUMERIC(10, 2),
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (location_id, term)
);
