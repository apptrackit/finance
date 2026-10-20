-- Cash rows already point to investment trades. Add the reverse link without
-- rebuilding either ledger or changing any recorded amounts/quantities.
ALTER TABLE investment_transactions ADD COLUMN linked_transaction_id TEXT REFERENCES transactions(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_transactions_cash_link
  ON investment_transactions(linked_transaction_id) WHERE linked_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_linked_transaction_id ON transactions(linked_transaction_id);

-- Link metadata is not a financial-source change. Keep the existing revision
-- behavior for all pre-existing investment fields, including notes.
DROP TRIGGER IF EXISTS financial_revision_investment_transactions_update;
CREATE TRIGGER financial_revision_investment_transactions_update
AFTER UPDATE ON investment_transactions
WHEN OLD.id IS NOT NEW.id OR OLD.account_id IS NOT NEW.account_id OR OLD.type IS NOT NEW.type
  OR OLD.quantity IS NOT NEW.quantity OR OLD.price IS NOT NEW.price OR OLD.total_amount IS NOT NEW.total_amount
  OR OLD.date IS NOT NEW.date OR OLD.notes IS NOT NEW.notes OR OLD.created_at IS NOT NEW.created_at
BEGIN
  UPDATE financial_data_revision SET revision = revision + 1,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

-- Archived history needs the same metadata repair. Restore its read-only guard
-- immediately after the backfill; no account or financial fields are changed.
DROP TRIGGER IF EXISTS archived_investment_transactions_update;
UPDATE investment_transactions AS i SET linked_transaction_id = (
  SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id
  WHERE t.linked_transaction_id = i.id AND a.type != 'investment'
    AND t.status = 'posted' AND t.date = i.date
    AND ((i.type = 'buy' AND t.amount < 0) OR (i.type = 'sell' AND t.amount > 0))
)
WHERE (SELECT COUNT(*) FROM transactions t WHERE t.linked_transaction_id = i.id) = 1
  AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = i.account_id AND a.type = 'investment')
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = i.id)
  AND NOT EXISTS (SELECT 1 FROM investment_transactions other JOIN transactions t ON t.id = other.id
    WHERE t.linked_transaction_id = i.id);

CREATE TRIGGER archived_investment_transactions_update
BEFORE UPDATE ON investment_transactions
WHEN EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND archived_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_ARCHIVED'); END;
