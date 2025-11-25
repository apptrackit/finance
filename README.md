# Secure Personal Finance Manager (Self-Hosted)

## Context
I am building a secure, single-tenant Personal Finance Manager (PFM). 
The app will be self-hosted on Cloudflare Pages/Workers.
It must be "Zero Trust" secure—meaning the app assumes it is behind a Cloudflare Access gateway.

## Tech Stack
- **Runtime:** Cloudflare Workers (Node.js compatibility mode).
- **Framework:** Hono (for the API backend).
- **Database:** Cloudflare D1 (SQLite).
- **Frontend:** React (Vite) + TailwindCSS + Shadcn/UI (for clean components).
- **Language:** TypeScript (Strict mode).

## Core Features (MVP)
1. **Dashboard:** View total Net Worth (calculated sum of all accounts).
2. **Accounts:** Create manual accounts (e.g., "Chase Bank", "Bitcoin Cold Wallet"). 
   - Fields: Name, Type (Cash, Investment, Credit), Currency, Current Balance.
3. **Transactions:** Manually add transactions.
   - Fields: Date, Amount, Description, Category, AccountID, Type (Income/Expense).
4. **Recurring Logic:** Simple "Monthly" flag on transactions that auto-clones them next month.
5. **Security:** - API must verify the `CF-Access-Jwt-Assertion` header if present (for audit), but primarily rely on the network layer security.
   - No built-in login page (Cloudflare Access handles this).

## Database Schema (D1 SQLite)
```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'cash', 'investment', 'credit'
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  updated_at INTEGER
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT, -- emoji or icon name
  type TEXT NOT NULL -- 'income', 'expense'
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  category_id TEXT,
  amount REAL NOT NULL, -- negative for expense, positive for income
  description TEXT,
  date TEXT NOT NULL, -- ISO 8601 YYYY-MM-DD
  is_recurring BOOLEAN DEFAULT 0,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
```

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Setup D1 Database:**
   - Create a D1 database in Cloudflare dashboard.
   - Update `api/wrangler.toml` with your `database_id`.
   - Apply schema:
     ```bash
     cd api
     npx wrangler d1 execute finance-db --local --file=./schema.sql
     ```

3. **Run Development:**
   ```bash
   npm run dev
   ```
   - Client: http://localhost:5173
   - API: http://localhost:8787

4. **Deploy:**
   ```bash
   npm run deploy
   ```
