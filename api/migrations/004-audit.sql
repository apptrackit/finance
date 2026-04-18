-- Audit log: tracks all data-modifying operations
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,      -- 'CREATE', 'UPDATE', 'DELETE'
  entity TEXT NOT NULL,      -- 'account', 'transaction', 'category', 'budget', 'recurring_schedule'
  entity_id TEXT NOT NULL,
  details TEXT,              -- JSON: changed fields or summary
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
