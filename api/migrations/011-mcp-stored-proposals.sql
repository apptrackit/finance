-- Canonical, expiring MCP draft proposals are stored in D1 so creation never
-- depends on a signed payload crossing the agent/MCP boundary.
CREATE TABLE IF NOT EXISTS mcp_draft_proposals (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_mcp_draft_proposals_expiry
  ON mcp_draft_proposals(expires_at);
