CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  name TEXT,
  amount REAL NOT NULL,
  period TEXT NOT NULL, -- 'monthly', 'yearly'
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT NOT NULL, -- YYYY-MM-DD
  account_scope TEXT NOT NULL, -- 'all', 'cash', 'selected'
  category_scope TEXT NOT NULL, -- 'all', 'selected'
  currency TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_accounts (
  budget_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  PRIMARY KEY (budget_id, account_id),
  FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget_categories (
  budget_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (budget_id, category_id),
  FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);
