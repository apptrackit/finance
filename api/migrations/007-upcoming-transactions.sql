-- One-time upcoming transactions.
-- Pending rows are visible for confirmation but do not affect balances
-- or posted transaction analytics until confirmed.
ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE transactions ADD COLUMN confirmed_at INTEGER;
ALTER TABLE transactions ADD COLUMN cancelled_at INTEGER;
ALTER TABLE transactions ADD COLUMN created_at INTEGER;
ALTER TABLE transactions ADD COLUMN updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_transactions_status_date ON transactions(status, date);
