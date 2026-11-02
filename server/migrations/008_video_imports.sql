-- Video-first imports (TikTok / YouTube / Instagram) and phone share keys.

-- Where a recipe came from, so the cookbook can show the creator and link
-- back to the original video.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_platform VARCHAR(20);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_author VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_recipes_household_source_url ON recipes(household_id, source_url);

-- Long-lived key an iOS Shortcut sends instead of a login token. Only the
-- SHA-256 hash is stored; the key itself is shown once when it's created.
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_key_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_import_key_hash ON users(import_key_hash) WHERE import_key_hash IS NOT NULL;
