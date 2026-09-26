-- Expiring, user-confirmed corrections for linked MCP cash transfer reviews.
-- Separate storage keeps transfer-pair proposals distinct from unlinked draft corrections.
CREATE TABLE IF NOT EXISTS mcp_transfer_correction_proposals (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS mcp_transfer_correction_runs (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
