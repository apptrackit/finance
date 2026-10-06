-- Archive is separate from locks and calculation exclusions. Accounts remain in
-- reads/exports so historical balance reconstruction can retain their ledger.
ALTER TABLE accounts ADD COLUMN archived_at INTEGER CHECK (archived_at IS NULL OR (typeof(archived_at) = 'integer' AND archived_at > 0));
CREATE INDEX IF NOT EXISTS idx_accounts_archived_at ON accounts(archived_at);

CREATE TRIGGER IF NOT EXISTS account_archive_requirements
BEFORE UPDATE OF archived_at ON accounts
WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
BEGIN
  SELECT CASE WHEN OLD.is_locked = 1 THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
  SELECT CASE WHEN OLD.balance != 0 OR NEW.balance != 0 THEN RAISE(ABORT, 'ACCOUNT_ARCHIVE_NONZERO') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM transactions WHERE account_id = OLD.id AND status = 'pending')
    THEN RAISE(ABORT, 'ACCOUNT_ARCHIVE_PENDING') END;
END;

CREATE TRIGGER IF NOT EXISTS account_archive_lifecycle
AFTER UPDATE OF archived_at ON accounts
WHEN OLD.archived_at IS NOT NEW.archived_at
BEGIN
  UPDATE recurring_schedules SET is_active = 0
    WHERE NEW.archived_at IS NOT NULL AND (account_id = NEW.id OR to_account_id = NEW.id);
  INSERT INTO audit_log (id, action, entity, entity_id, details, created_at)
    VALUES (lower(hex(randomblob(16))), 'UPDATE', 'account', NEW.id,
      json_object('archived_at', NEW.archived_at, 'action', CASE WHEN NEW.archived_at IS NULL THEN 'restore' ELSE 'archive' END), NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS archived_account_read_only
BEFORE UPDATE ON accounts
WHEN OLD.archived_at IS NOT NULL AND (
  NEW.name IS NOT OLD.name OR NEW.type IS NOT OLD.type OR NEW.balance IS NOT OLD.balance OR
  NEW.currency IS NOT OLD.currency OR NEW.quote_currency IS NOT OLD.quote_currency OR
  NEW.symbol IS NOT OLD.symbol OR NEW.asset_type IS NOT OLD.asset_type OR
  NEW.is_locked IS NOT OLD.is_locked OR NEW.exclude_from_net_worth IS NOT OLD.exclude_from_net_worth OR
  NEW.exclude_from_cash_balance IS NOT OLD.exclude_from_cash_balance)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

-- Deletion cannot strand a linked transfer or change another account's balance.
-- Restore archived accounts before deleting; archive is the normal history-safe path.
CREATE TRIGGER IF NOT EXISTS account_delete_safety
BEFORE DELETE ON accounts
BEGIN
  SELECT CASE WHEN OLD.archived_at IS NOT NULL THEN RAISE(ABORT, 'ACCOUNT_ARCHIVED') END;
  SELECT CASE WHEN OLD.is_locked = 1 THEN RAISE(ABORT, 'ACCOUNT_LOCKED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM transactions WHERE account_id = OLD.id AND linked_transaction_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM transactions t JOIN investment_transactions i ON t.linked_transaction_id = i.id WHERE i.account_id = OLD.id)
    THEN RAISE(ABORT, 'ACCOUNT_DELETE_LINKED') END;
  DELETE FROM transactions WHERE account_id = OLD.id;
  DELETE FROM investment_transactions WHERE account_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS archived_transactions_insert
BEFORE INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_transactions_update
BEFORE UPDATE ON transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL) OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_transactions_delete
BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_investment_transactions_insert
BEFORE INSERT ON investment_transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_investment_transactions_update
BEFORE UPDATE ON investment_transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL) OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_investment_transactions_delete
BEFORE DELETE ON investment_transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_schedule_insert
BEFORE INSERT ON recurring_schedules
WHEN NEW.is_active = 1 AND EXISTS (SELECT 1 FROM accounts WHERE id IN (NEW.account_id, NEW.to_account_id) AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;

CREATE TRIGGER IF NOT EXISTS archived_schedule_update
BEFORE UPDATE ON recurring_schedules
WHEN NEW.is_active = 1 AND EXISTS (SELECT 1 FROM accounts WHERE id IN (NEW.account_id, NEW.to_account_id) AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;
