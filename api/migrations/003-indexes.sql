-- Performance indexes for frequently filtered/sorted columns
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_linked_id ON transactions(linked_transaction_id);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_account_id ON investment_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_date ON investment_transactions(date);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_is_active ON recurring_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_account_id ON recurring_schedules(account_id);
