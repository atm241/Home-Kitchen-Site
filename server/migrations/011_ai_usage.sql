-- One row per paid AI call that a user can trigger at will (video import,
-- recipe photo, receipt scan). Used to cap each household's daily usage so a
-- single account can't run up the server owner's Anthropic bill.
CREATE TABLE IF NOT EXISTS ai_usage (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_household_kind_time
    ON ai_usage (household_id, kind, created_at);
