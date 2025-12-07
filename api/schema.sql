CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'cash', 'investment', 'credit'
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  symbol TEXT, -- For investment accounts: stock/crypto symbol
  asset_type TEXT, -- For investment accounts: 'stock', 'crypto', 'manual'
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
  is_recurring BOOLEAN DEFAULT 0,
  linked_transaction_id TEXT,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
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
