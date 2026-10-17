-- Reconstructible provider inputs only. No account/ledger references, backfills,
-- financial revision triggers or changes to user-owned facts.
CREATE TABLE IF NOT EXISTS market_data_cache (
  cache_key TEXT PRIMARY KEY CHECK(length(cache_key) BETWEEN 1 AND 200),
  payload TEXT NOT NULL CHECK(json_valid(payload) AND length(payload) <= 1048576),
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  stale_until INTEGER NOT NULL,
  CHECK(fetched_at <= expires_at AND expires_at <= stale_until)
);
CREATE INDEX IF NOT EXISTS idx_market_cache_expiry ON market_data_cache(stale_until);
