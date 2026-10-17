-- Preserve all legacy amounts/currencies/links. Null facts mean unverified,
-- never a guessed USD execution, fee, settlement or cash contribution.
ALTER TABLE investment_transactions ADD COLUMN execution_currency TEXT;
ALTER TABLE investment_transactions ADD COLUMN gross_amount REAL;
ALTER TABLE investment_transactions ADD COLUMN fee_amount REAL;
ALTER TABLE investment_transactions ADD COLUMN fee_currency TEXT;
ALTER TABLE investment_transactions ADD COLUMN fee_status TEXT CHECK (fee_status IS NULL OR fee_status IN ('known', 'unknown'));
ALTER TABLE investment_transactions ADD COLUMN cash_amount REAL;
ALTER TABLE investment_transactions ADD COLUMN cash_currency TEXT;
ALTER TABLE investment_transactions ADD COLUMN effective_order INTEGER;
ALTER TABLE investment_transactions ADD COLUMN trade_version INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS financial_revision_investment_transactions_update;
DROP TRIGGER IF EXISTS archived_investment_transactions_update;
UPDATE investment_transactions SET effective_order = rowid;
CREATE TRIGGER archived_investment_transactions_update BEFORE UPDATE ON investment_transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id IN (OLD.account_id, NEW.account_id) AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;
DROP TRIGGER IF EXISTS position_anchor_immutable;
ALTER TABLE investment_position_anchors ADD COLUMN trade_order_boundary INTEGER;
UPDATE investment_position_anchors SET trade_order_boundary = trade_rowid_boundary;
CREATE TRIGGER position_anchor_immutable BEFORE UPDATE ON investment_position_anchors BEGIN
  SELECT RAISE(ABORT, 'HOLDING_ANCHOR_IMMUTABLE');
END;
CREATE TABLE investment_trade_sequence (id INTEGER PRIMARY KEY CHECK(id = 1), last_order INTEGER NOT NULL);
INSERT INTO investment_trade_sequence VALUES (1, COALESCE((SELECT MAX(effective_order) FROM investment_transactions), 0));
CREATE TABLE investment_trade_operations (
  idempotency_key TEXT PRIMARY KEY, claim_token TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX idx_trade_operations_expiry ON investment_trade_operations(expires_at);
CREATE INDEX idx_investment_effective_order ON investment_transactions(account_id, date, effective_order);
CREATE TRIGGER financial_revision_investment_transactions_update
AFTER UPDATE OF id, created_at, account_id, type, quantity, price, total_amount, date, notes,
  execution_currency, gross_amount, fee_amount, fee_currency, fee_status, cash_amount, cash_currency, effective_order, trade_version ON investment_transactions
BEGIN UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1; END;
CREATE TRIGGER trade_cash_currency_identity BEFORE UPDATE OF currency ON accounts
WHEN NEW.currency IS NOT OLD.currency AND EXISTS (
  SELECT 1 FROM investment_transactions i JOIN transactions c ON c.id = i.linked_transaction_id
  WHERE c.account_id = OLD.id AND i.cash_currency IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'TRADE_CASH_CURRENCY'); END;
CREATE TRIGGER protected_trade_facts BEFORE UPDATE ON investment_transactions
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id IN (OLD.account_id, NEW.account_id) AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id IN (OLD.account_id, NEW.account_id) AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
END;
