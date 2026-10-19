-- A split is one payment divided over several categories. Lines stay ordinary
-- rows in transactions, so balances, analytics, estimates, history and exports
-- keep working; this table only holds what the lines share. The split total is
-- never stored: it is SUM(amount) over the lines, so it cannot drift.
CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

ALTER TABLE transactions ADD COLUMN split_id TEXT REFERENCES transaction_splits(id);
CREATE INDEX IF NOT EXISTS idx_transactions_split_id ON transactions(split_id);

-- A split is one payment: lines share account, date and status, and are never transfer legs.
CREATE TRIGGER IF NOT EXISTS split_line_insert
BEFORE INSERT ON transactions
WHEN NEW.split_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.linked_transaction_id IS NOT NULL THEN RAISE(ABORT, 'SPLIT_TRANSFER') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM transactions WHERE split_id = NEW.split_id
    AND (account_id != NEW.account_id OR date != NEW.date OR status != NEW.status))
    THEN RAISE(ABORT, 'SPLIT_MISMATCH') END;
END;

-- Deleting the last line removes the split row.
CREATE TRIGGER IF NOT EXISTS split_cleanup
AFTER DELETE ON transactions
WHEN OLD.split_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE split_id = OLD.split_id)
BEGIN
  DELETE FROM transaction_splits WHERE id = OLD.split_id;
END;
-- There is no matching UPDATE trigger on purpose: changing a split's date updates
-- all lines in one statement and a per-row check would abort halfway. The API
-- keeps the shared fields in sync instead.
