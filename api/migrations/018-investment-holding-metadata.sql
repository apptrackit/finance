-- Add metadata without rewriting any existing ledger columns, quantities or cash.
ALTER TABLE accounts ADD COLUMN pricing_method TEXT CHECK (pricing_method IS NULL OR pricing_method IN ('market', 'manual'));
ALTER TABLE accounts ADD COLUMN unit TEXT;
ALTER TABLE accounts ADD COLUMN provider TEXT CHECK (provider IS NULL OR provider = 'yahoo');
ALTER TABLE accounts ADD COLUMN exchange TEXT;
ALTER TABLE accounts ADD COLUMN manual_price REAL CHECK (manual_price IS NULL OR (manual_price >= 0 AND manual_price <= 1e12));
ALTER TABLE accounts ADD COLUMN manual_price_date TEXT;

-- Metadata backfill does not change the financial source revision. Old columns
-- and timestamps are untouched, including for locked and archived holdings.
DROP TRIGGER IF EXISTS financial_revision_accounts_update;
UPDATE accounts SET pricing_method = CASE WHEN asset_type = 'manual' THEN 'manual' ELSE 'market' END,
  unit = CASE WHEN asset_type = 'manual' THEN 'ITEM' ELSE currency END,
  provider = CASE WHEN asset_type IS NOT 'manual' AND symbol IS NOT NULL AND symbol != '' THEN 'yahoo' END
WHERE type = 'investment';

CREATE TABLE IF NOT EXISTS investment_position_anchors (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('observed', 'opening', 'correction')),
  effective_date TEXT NOT NULL CHECK (length(effective_date) = 10 AND date(effective_date, '+0 days') IS NOT NULL AND date(effective_date, '+0 days') = effective_date),
  balance REAL NOT NULL,
  cost_amount REAL CHECK (cost_amount IS NULL OR (cost_amount >= 0 AND cost_amount <= 1e12)),
  cost_currency TEXT,
  trade_rowid_boundary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK ((cost_amount IS NULL) = (cost_currency IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_position_anchors_account ON investment_position_anchors(account_id);
INSERT INTO investment_position_anchors (id, account_id, kind, effective_date, balance, trade_rowid_boundary, created_at)
SELECT 'legacy-position:' || a.id, a.id, 'observed', date('now'), a.balance,
  COALESCE((SELECT MAX(t.rowid) FROM investment_transactions t WHERE t.account_id = a.id), 0),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM accounts a WHERE a.type = 'investment';

CREATE TRIGGER financial_revision_accounts_update AFTER UPDATE ON accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER financial_revision_position_anchor_insert AFTER INSERT ON investment_position_anchors BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER financial_revision_position_anchor_delete AFTER DELETE ON investment_position_anchors BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER position_anchor_immutable BEFORE UPDATE ON investment_position_anchors BEGIN
  SELECT RAISE(ABORT, 'HOLDING_ANCHOR_IMMUTABLE');
END;
CREATE TRIGGER position_anchor_requirements BEFORE INSERT ON investment_position_anchors BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND type = 'investment') THEN RAISE(ABORT, 'HOLDING_ACCOUNT_REQUIRED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
  SELECT CASE WHEN NEW.kind = 'opening' AND EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = NEW.account_id AND a.asset_type IS NOT 'manual'
    AND abs(a.balance - NEW.balance - COALESCE((SELECT SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END)
      FROM investment_transactions t WHERE t.account_id = a.id AND t.date > NEW.effective_date), 0)) > max(5e-13, abs(a.balance) * 2e-15)
  ) THEN RAISE(ABORT, 'HOLDING_POSITION_MISMATCH') END;
END;

-- Preserve archive protection for the newly durable account fields too.
DROP TRIGGER IF EXISTS archived_account_read_only;
CREATE TRIGGER archived_account_read_only BEFORE UPDATE ON accounts
WHEN OLD.archived_at IS NOT NULL AND (
  NEW.name IS NOT OLD.name OR NEW.type IS NOT OLD.type OR NEW.balance IS NOT OLD.balance OR
  NEW.currency IS NOT OLD.currency OR NEW.quote_currency IS NOT OLD.quote_currency OR NEW.symbol IS NOT OLD.symbol OR
  NEW.asset_type IS NOT OLD.asset_type OR NEW.is_locked IS NOT OLD.is_locked OR
  NEW.exclude_from_net_worth IS NOT OLD.exclude_from_net_worth OR NEW.exclude_from_cash_balance IS NOT OLD.exclude_from_cash_balance OR
  NEW.pricing_method IS NOT OLD.pricing_method OR NEW.unit IS NOT OLD.unit OR NEW.provider IS NOT OLD.provider OR
  NEW.exchange IS NOT OLD.exchange OR NEW.manual_price IS NOT OLD.manual_price OR NEW.manual_price_date IS NOT OLD.manual_price_date)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER holding_history_metadata BEFORE UPDATE ON accounts
WHEN (OLD.type = 'investment' OR NEW.type = 'investment') AND (
  OLD.balance != 0 OR EXISTS (SELECT 1 FROM transactions WHERE account_id = OLD.id) OR
  EXISTS (SELECT 1 FROM investment_transactions WHERE account_id = OLD.id) OR
  EXISTS (SELECT 1 FROM investment_position_anchors WHERE account_id = OLD.id AND balance != 0)
) AND (
  OLD.type IS NOT NEW.type OR OLD.currency IS NOT NEW.currency OR OLD.quote_currency IS NOT NEW.quote_currency OR
  OLD.symbol IS NOT NEW.symbol OR OLD.unit IS NOT NEW.unit OR OLD.pricing_method IS NOT NEW.pricing_method OR
  OLD.provider IS NOT NEW.provider OR OLD.exchange IS NOT NEW.exchange OR
  (OLD.asset_type IS NOT NEW.asset_type AND NOT (COALESCE(OLD.asset_type IN ('stock', 'etf'), 0) AND COALESCE(NEW.asset_type IN ('stock', 'etf'), 0)))
)
BEGIN SELECT RAISE(ABORT, 'HOLDING_HISTORY_METADATA'); END;

-- A dated opening is EOD. New events cannot be silently inserted into it.
CREATE TRIGGER investment_opening_insert BEFORE INSERT ON investment_transactions
WHEN EXISTS (SELECT 1 FROM investment_position_anchors p WHERE p.account_id = NEW.account_id AND p.kind = 'opening'
  AND p.rowid = (SELECT MAX(x.rowid) FROM investment_position_anchors x WHERE x.account_id = NEW.account_id)
  AND NEW.date <= p.effective_date)
BEGIN SELECT RAISE(ABORT, 'HOLDING_OPENING_DATE'); END;
CREATE TRIGGER investment_opening_update BEFORE UPDATE ON investment_transactions
WHEN (OLD.date IS NOT NEW.date OR OLD.account_id IS NOT NEW.account_id) AND EXISTS (
  SELECT 1 FROM investment_position_anchors p WHERE p.account_id = NEW.account_id AND p.kind = 'opening'
    AND p.rowid = (SELECT MAX(x.rowid) FROM investment_position_anchors x WHERE x.account_id = NEW.account_id)
    AND NEW.date <= p.effective_date)
BEGIN SELECT RAISE(ABORT, 'HOLDING_OPENING_DATE'); END;

CREATE TRIGGER locked_holding_metadata BEFORE UPDATE ON accounts
WHEN OLD.type = 'investment' AND OLD.is_locked = 1 AND (
  NEW.pricing_method IS NOT OLD.pricing_method OR NEW.unit IS NOT OLD.unit OR NEW.provider IS NOT OLD.provider OR
  NEW.exchange IS NOT OLD.exchange OR NEW.manual_price IS NOT OLD.manual_price OR NEW.manual_price_date IS NOT OLD.manual_price_date)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_LOCKED'); END;

CREATE TRIGGER protected_position_anchor_delete BEFORE DELETE ON investment_position_anchors
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
END;
