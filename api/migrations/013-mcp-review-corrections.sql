-- Previewed changes to unresolved MCP review drafts. A completed run is kept
-- separately so concurrent retries return the original result.
CREATE TABLE IF NOT EXISTS mcp_draft_correction_proposals (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS mcp_draft_correction_runs (
  id TEXT PRIMARY KEY,
  proposal_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_review_queue
  ON transactions(status, pending_kind, review_source, created_at, id);

-- Review drafts are excluded from forecast inputs. Changes to them alone must
-- not mark an existing financial outlook stale; posting one still does.
DROP TRIGGER IF EXISTS financial_revision_transactions_insert;
DROP TRIGGER IF EXISTS financial_revision_transactions_update;
DROP TRIGGER IF EXISTS financial_revision_transactions_delete;

CREATE TRIGGER financial_revision_transactions_insert
AFTER INSERT ON transactions
WHEN NEW.status = 'posted' OR (NEW.status = 'pending' AND NEW.pending_kind = 'upcoming')
BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER financial_revision_transactions_update
AFTER UPDATE ON transactions
WHEN OLD.status = 'posted' OR (OLD.status = 'pending' AND OLD.pending_kind = 'upcoming')
  OR NEW.status = 'posted' OR (NEW.status = 'pending' AND NEW.pending_kind = 'upcoming')
BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER financial_revision_transactions_delete
AFTER DELETE ON transactions
WHEN OLD.status = 'posted' OR (OLD.status = 'pending' AND OLD.pending_kind = 'upcoming')
BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
