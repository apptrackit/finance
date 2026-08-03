-- Draft transactions proposed through the MCP server remain pending until the
-- user explicitly confirms them in the Finance Manager UI.
ALTER TABLE transactions ADD COLUMN pending_kind TEXT NOT NULL DEFAULT 'upcoming'
  CHECK (pending_kind IN ('upcoming', 'mcp_review'));
ALTER TABLE transactions ADD COLUMN review_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (review_source IN ('manual', 'chatgpt_mcp'));
ALTER TABLE transactions ADD COLUMN review_batch_id TEXT;
ALTER TABLE transactions ADD COLUMN review_flags TEXT NOT NULL DEFAULT '[]';

-- The MCP server uses this small ledger to make batch creation idempotent. The
-- signed proposal token contains the proposal contents and expiry; only its
-- canonical hash needs to be retained here.
CREATE TABLE IF NOT EXISTS mcp_draft_batches (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_status_pending_kind_date
  ON transactions(status, pending_kind, date);
CREATE INDEX IF NOT EXISTS idx_transactions_review_batch_id
  ON transactions(review_batch_id);
