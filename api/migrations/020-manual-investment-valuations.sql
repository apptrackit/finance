-- Dated observations are prices/values, never cash, cost or quantity movements.
ALTER TABLE investment_position_anchors ADD COLUMN owned INTEGER CHECK (owned IS NULL OR owned IN (0,1));
ALTER TABLE investment_transactions ADD COLUMN asset_event TEXT CHECK (asset_event IS NULL OR asset_event IN ('acquisition', 'disposal'));
CREATE TABLE investment_valuations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  effective_date TEXT NOT NULL CHECK (length(effective_date) = 10 AND date(effective_date, '+0 days') IS NOT NULL AND date(effective_date, '+0 days') = effective_date),
  kind TEXT NOT NULL CHECK (kind IN ('total', 'per_unit')),
  amount REAL NOT NULL CHECK (amount >= 0 AND amount <= 1e12),
  currency TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('baseline', 'initial', 'user', 'acquisition')),
  source_trade_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(account_id, effective_date)
);
-- Baseline is an observation at upgrade, not an invented purchase or opening.
-- A saved per-unit price with a valid past as-of date retains that known date.
INSERT INTO investment_valuations (id,account_id,effective_date,kind,amount,currency,source,created_at,updated_at)
SELECT 'baseline-valuation:' || id, id,
  CASE WHEN asset_type IS NOT 'manual' AND date(manual_price_date, '+0 days') = manual_price_date AND manual_price_date <= date('now') THEN manual_price_date ELSE date('now') END,
  CASE WHEN asset_type = 'manual' THEN 'total' ELSE 'per_unit' END,
  CASE WHEN asset_type = 'manual' THEN balance ELSE manual_price END,
  CASE WHEN asset_type = 'manual' THEN currency ELSE quote_currency END,
  'baseline', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
FROM accounts WHERE type = 'investment' AND (asset_type = 'manual' OR pricing_method = 'manual')
  AND ((asset_type = 'manual' AND balance BETWEEN 0 AND 1e12) OR (asset_type IS NOT 'manual' AND manual_price IS NOT NULL AND quote_currency IS NOT NULL));

CREATE TRIGGER manual_valuation_identity BEFORE UPDATE ON investment_valuations
WHEN NEW.id IS NOT OLD.id OR NEW.account_id IS NOT OLD.account_id OR NEW.effective_date IS NOT OLD.effective_date
  OR NEW.kind IS NOT OLD.kind OR NEW.currency IS NOT OLD.currency OR NEW.created_at IS NOT OLD.created_at
  OR NEW.source_trade_id IS NOT OLD.source_trade_id OR NEW.version != OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'VALUATION_IDENTITY'); END;
CREATE TRIGGER protected_valuation_insert BEFORE INSERT ON investment_valuations BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND type = 'investment'
    AND ((asset_type = 'manual' AND NEW.kind = 'total' AND NEW.currency = currency)
      OR (asset_type IS NOT 'manual' AND pricing_method = 'manual' AND NEW.kind = 'per_unit' AND NEW.currency = quote_currency)))
    THEN RAISE(ABORT, 'VALUATION_HOLDING_REQUIRED') END;
END;
CREATE TRIGGER financial_revision_valuation_insert AFTER INSERT ON investment_valuations BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = 1;
END;
CREATE TRIGGER protected_valuation_update BEFORE UPDATE ON investment_valuations BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND type = 'investment'
    AND ((asset_type = 'manual' AND NEW.kind = 'total' AND NEW.currency = currency)
      OR (asset_type IS NOT 'manual' AND pricing_method = 'manual' AND NEW.kind = 'per_unit' AND NEW.currency = quote_currency)))
    THEN RAISE(ABORT, 'VALUATION_HOLDING_REQUIRED') END;
END;
CREATE TRIGGER financial_revision_valuation_update AFTER UPDATE ON investment_valuations BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = 1;
END;
CREATE TRIGGER protected_valuation_delete BEFORE DELETE ON investment_valuations BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL) THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND is_locked = 1) THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
END;
CREATE TRIGGER financial_revision_valuation_delete AFTER DELETE ON investment_valuations BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = 1;
END;
-- Valuation history also protects instrument/currency identity at zero units/value.
CREATE TRIGGER valuation_account_identity BEFORE UPDATE ON accounts
WHEN EXISTS (SELECT 1 FROM investment_valuations WHERE account_id = OLD.id) AND (
  NEW.type IS NOT OLD.type OR NEW.currency IS NOT OLD.currency OR NEW.quote_currency IS NOT OLD.quote_currency
  OR NEW.symbol IS NOT OLD.symbol OR NEW.unit IS NOT OLD.unit OR NEW.pricing_method IS NOT OLD.pricing_method
  OR (NEW.asset_type IS NOT OLD.asset_type AND NOT (COALESCE(OLD.asset_type IN ('stock','etf'),0) AND COALESCE(NEW.asset_type IN ('stock','etf'),0))))
BEGIN SELECT RAISE(ABORT, 'HOLDING_HISTORY_METADATA'); END;
CREATE TRIGGER manual_asset_event_requirements BEFORE INSERT ON investment_transactions
WHEN NEW.asset_event IS NOT NULL BEGIN
  SELECT CASE WHEN NEW.quantity != 1 OR NEW.asset_event != CASE WHEN NEW.type = 'buy' THEN 'acquisition' ELSE 'disposal' END
    OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND type = 'investment' AND asset_type = 'manual')
    THEN RAISE(ABORT, 'MANUAL_ASSET_EVENT') END;
END;
DROP TRIGGER financial_revision_investment_transactions_update;
CREATE TRIGGER financial_revision_investment_transactions_update
AFTER UPDATE OF id, created_at, account_id, type, quantity, price, total_amount, date, notes,
  execution_currency, gross_amount, fee_amount, fee_currency, fee_status, cash_amount, cash_currency, effective_order, trade_version, asset_event ON investment_transactions
BEGIN UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1; END;

-- Ownership is separate from an appraisal: a worthless owned ITEM cannot archive.
CREATE TRIGGER manual_owned_archive BEFORE UPDATE OF archived_at ON accounts
WHEN OLD.asset_type = 'manual' AND OLD.balance = 0 AND NEW.balance = 0 AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
AND EXISTS (SELECT 1 FROM accounts a LEFT JOIN investment_position_anchors p ON p.rowid =
  (SELECT MAX(x.rowid) FROM investment_position_anchors x WHERE x.account_id = a.id)
  WHERE a.id = OLD.id AND (
COALESCE((SELECT CASE WHEN t.asset_event = 'acquisition' THEN 'owned' ELSE 'disposed' END
  FROM investment_transactions t WHERE t.account_id = a.id AND t.asset_event IS NOT NULL
    AND (CASE WHEN p.kind = 'opening' THEN t.date > p.effective_date ELSE t.effective_order > COALESCE(p.trade_order_boundary,p.trade_rowid_boundary,0) END)
  ORDER BY t.date DESC, t.effective_order DESC, t.id DESC LIMIT 1),
  CASE WHEN p.owned = 1 THEN 'owned' WHEN p.owned = 0 THEN 'unowned' WHEN p.balance > 0 THEN 'owned' ELSE 'unknown' END)
) IN ('owned','unknown')) BEGIN SELECT RAISE(ABORT, 'MANUAL_ASSET_OWNED'); END;
CREATE TRIGGER manual_asset_event_update BEFORE UPDATE ON investment_transactions
WHEN NEW.asset_event IS NOT NULL BEGIN
  SELECT CASE WHEN NEW.quantity != 1 OR NEW.asset_event != CASE WHEN NEW.type = 'buy' THEN 'acquisition' ELSE 'disposal' END
    OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND type = 'investment' AND asset_type = 'manual')
    THEN RAISE(ABORT, 'MANUAL_ASSET_EVENT') END;
END;
CREATE TRIGGER protected_manual_event_insert BEFORE INSERT ON investment_transactions
WHEN NEW.asset_event IS NOT NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND is_locked = 1)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_LOCKED'); END;
CREATE TRIGGER protected_manual_event_delete BEFORE DELETE ON investment_transactions
WHEN OLD.asset_event IS NOT NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND is_locked = 1)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_LOCKED'); END;
