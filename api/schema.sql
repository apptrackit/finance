CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'cash', 'investment', 'credit'
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
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
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT,
  type TEXT NOT NULL, -- 'stock', 'crypto', 'manual'
  quantity REAL NOT NULL,
  purchase_price REAL, -- average purchase price per share
  manual_price REAL, -- for manually tracked assets
  currency TEXT DEFAULT 'USD',
  updated_at INTEGER
);
