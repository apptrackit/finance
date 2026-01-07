CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'cash', 'investment', 'credit'
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  symbol TEXT, -- For investment accounts: stock/crypto symbol
  asset_type TEXT, -- For investment accounts: 'stock', 'crypto', 'manual'
  exclude_from_net_worth BOOLEAN DEFAULT 0, -- For cash accounts: exclude from net worth calculation
  exclude_from_cash_balance BOOLEAN DEFAULT 0, -- For cash accounts: exclude from cash balance total
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- Each category name must be unique
  icon TEXT, -- emoji or icon name
  type TEXT NOT NULL -- 'income', 'expense'
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  category_id TEXT,
  amount REAL NOT NULL, -- negative for expense, positive for income
  description TEXT,
  date TEXT NOT NULL, -- ISO 8601 YYYY-MM-DD
  linked_transaction_id TEXT,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'transaction', 'transfer'
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  day_of_week INTEGER, -- 0-6 for weekly (0 = Sunday)
  day_of_month INTEGER, -- 1-31 for monthly
  account_id TEXT NOT NULL, -- For transactions: the account; For transfers: from_account
  to_account_id TEXT, -- Only for transfers
  category_id TEXT, -- Only for transactions
  amount REAL NOT NULL,
  amount_to REAL, -- Only for transfers with different currencies
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_processed_date TEXT, -- Last date when this was processed (YYYY-MM-DD)
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(to_account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Investment transactions are now tracked via regular transactions table
-- This table is kept for backward compatibility but not actively used
CREATE TABLE IF NOT EXISTS investment_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'buy', 'sell'
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total_amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
