# 💰 Finance Manager

> A full-stack personal finance tracker with multi-currency support, investment portfolio monitoring, and real-time market data integration.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
  - [Backend Deployment](#backend-deployment)
  - [Frontend Deployment](#frontend-deployment)
  - [Automated Deployment](#automated-deployment)
- [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
- [Core Features](#core-features)
- [How It Works](#how-it-works)
  - [Account System](#account-system)
  - [Transaction Flow](#transaction-flow)
  - [Investment Tracking](#investment-tracking)
  - [Privacy Mode](#privacy-mode)
  - [Recurring Transactions](#recurring-transactions)
- [Security](#security)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Local Setup](#local-setup)
  - [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)

---

## Overview

Finance Manager is a modern, privacy-focused personal finance application that helps you track your net worth, manage multiple accounts, monitor investments, and analyze spending patterns. Built on Cloudflare's edge network for global performance and security.

## Quick Start

### Backend Deployment

```bash
cd api
npx wrangler d1 execute finance-db --remote --file=schema.sql
npm run deploy
```

### Frontend Deployment

```bash
cd client
npm run build
npx wrangler pages deploy dist --project-name=finance-client
```

### Automated Deployment

Use the deployment script to deploy everything at once:

```bash
./deploy.sh finance-client
```

This script handles:
1. **Database schema updates** — Applies migrations to your D1 database
2. **API deployment** — Deploys backend to Cloudflare Workers
3. **Client build & deploy** — Builds React app and deploys to Cloudflare Pages

---

## Architecture

Finance Manager follows **clean architecture principles** with clear separation of concerns:

- **Backend**: Layered architecture with controllers, services, repositories, DTOs, and mappers
- **Frontend**: Component-based React architecture with context for global state
- **Database**: Edge-deployed SQLite (Cloudflare D1) for low-latency data access
- **Deployment**: Fully automated via deployment script

For detailed architecture documentation, see [API/ARCHITECTURE.md](api/ARCHITECTURE.md).

### Tech Stack

**Backend**
- **Runtime**: Cloudflare Workers (serverless, edge-deployed)
- **Framework**: Hono 4 (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Market Data**: Yahoo Finance API (yahoo-finance2 ^3.10)
- **Architecture**: Clean architecture with controllers, services, repositories, DTOs, and mappers

**Frontend**
- **Framework**: React 19.2 with TypeScript
- **Build Tool**: Vite 7.2
- **Styling**: Tailwind CSS 4.1 with custom design system
- **Charts**: Recharts 3.5 for data visualization
- **Icons**: Lucide React
- **State**: React Context API (Privacy, Alerts, Locked Accounts)
- **PWA**: Progressive Web App with offline support and service workers
- **Date Handling**: date-fns for date formatting and manipulation

### Project Structure

```
finance/
├── api/                      # Backend (Cloudflare Workers)
│   ├── src/
│   │   ├── config/          # Application configuration
│   │   ├── controllers/     # HTTP request handlers
│   │   ├── dtos/           # Data Transfer Objects
│   │   ├── mappers/        # Entity-DTO mapping
│   │   ├── middlewares/    # CORS & authentication
│   │   ├── models/         # Domain entities
│   │   ├── repositories/   # Database access layer
│   │   ├── routes/         # Route definitions
│   │   ├── services/       # Business logic layer
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   └── index.ts        # Application entry point
│   ├── schema.sql          # Database schema
│   ├── wrangler.toml       # Cloudflare Workers config
│   ├── ARCHITECTURE.md     # Detailed architecture docs
│   └── package.json
│
├── client/                   # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── AccountList.tsx
│   │   │   ├── TransactionList.tsx
│   │   │   ├── Investments.tsx
│   │   │   ├── InvestmentChart.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── DateRangePicker.tsx
│   │   │   ├── TransferForm.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── ui/          # Reusable UI components
│   │   ├── context/
│   │   │   └── PrivacyContext.tsx
│   │   ├── lib/
│   │   │   └── utils.ts     # Helper functions
│   │   ├── App.tsx          # Main application
│   │   ├── config.ts        # API configuration
│   │   └── main.tsx         # Entry point
│   ├── vite.config.ts       # Vite & PWA configuration
│   └── package.json
│
├── deploy.sh                 # Automated deployment script
└── package.json             # Workspace root
```

---

## Core Features

✨ **Multi-Account Management**
- Cash accounts (checking, savings, wallet)
- Investment accounts (stocks, crypto, manual assets)
- Multi-currency support with real-time conversion
- Account locking (prevent accidental modifications)

📊 **Transaction Tracking**
- Categorized income & expenses
- Recurring transactions
- Linked transfers between accounts
- Custom categories with emoji icons

📈 **Investment Portfolio**
- Real-time stock/crypto prices via Yahoo Finance
- Portfolio value tracking
- Transaction history (buy/sell)
- Performance charts and analytics

🔒 **Privacy Mode**
- Toggle to hide sensitive financial data
- Persistent user preference (cookie-based)
- Quick eye icon toggle in header

📉 **Analytics Dashboard**
- Net worth overview
- Income vs. expenses
- Category breakdown charts
- Monthly trends and patterns
- Date range filtering for custom periods
- Period selection (7 days, 30 days, 90 days, year, all time, custom)

⚙️ **Settings & Customization**
- Master currency selection (HUF, EUR, USD, GBP, CHF, PLN, CZK, RON)
- Category management with custom icons (150+ emoji options)
- Account exclusion options (exclude from net worth or cash balance)
- Privacy mode toggle
- Data export (JSON format)

🌍 **Global Deployment**
- Edge-deployed on Cloudflare network
- Sub-50ms response times worldwide
- Automatic HTTPS and DDoS protection

📱 **Progressive Web App (PWA)**
- Install on mobile devices and desktop
- Offline support with service workers
- Auto-updates and caching
- Native app-like experience

🔄 **Automated Features**
- Recurring transactions with scheduled tasks
- Monthly cron job to clone recurring transactions
- Auto-refresh investment prices (every 5 minutes)

---

## How It Works

### Account System

The application supports two types of accounts:

1. **Cash Accounts** — Traditional bank accounts, wallets
   - Direct balance management
   - Currency-specific

2. **Investment Accounts** — Asset holdings
   - **Stock/Crypto**: Auto-updates price from Yahoo Finance
   - **Manual**: User-defined assets without market data
   - Balance calculated from: `transactions × current_price`

### Transaction Flow

Every financial action is recorded as a transaction:

```
User Action → Transaction Record → Account Balance Update
```

**Example: Transfer $100 from Checking to Savings**
1. Creates 2 linked transactions:
   - Transaction A: Checking -$100 (expense)
   - Transaction B: Savings +$100 (income)
2. Both transactions share a `linked_transaction_id`
3. Account balances update atomically

**Investment Transactions** are tracked via regular transactions with a `price` field:
- Buy: Negative amount, increases holdings
- Sell: Positive amount, decreases holdings

### Investment Tracking

Investment accounts use a **transaction-based** approach:

1. User buys 10 shares of AAPL at $150/share
2. System creates transaction: `-$1500` amount, `price: 150`, `quantity: 10`
3. Current balance = `SUM(transactions.amount / price) × current_market_price`

**Auto-refresh** runs on:
- Page load
- Manual refresh button
- Every 5 minutes (in dashboard view)

### Privacy Mode

Privacy mode uses a **React Context** to globally mask sensitive data:

```tsx
// When enabled, transforms:
"$12,345.67" → "••••••"
"150 shares" → "•••"
```

- Preference saved in **localStorage + cookie**
- Survives page refresh
- Applies to: balances, amounts, quantities, charts

### Recurring Transactions

The application supports automated recurring transactions:

1. Mark any transaction as recurring when creating it
2. A **Cloudflare Cron Trigger** runs monthly (1st of each month)
3. All recurring transactions are automatically cloned to the current month
4. Configured in `wrangler.toml`: `crons = ["0 0 1 * *"]`

This enables automated handling of:
- Regular salary deposits
- Monthly subscriptions
- Recurring bills and expenses

---

## Security

**Three-Layer Security Model:**

1. **Cloudflare Access** (Frontend)
   - Email-based authentication
   - Only authorized users can view the app
   - 24-hour session duration

2. **API Key Authentication** (Backend)
   - Every API request requires `X-API-Key` header
   - Key stored in environment variables
   - Validates on every request

3. **CORS Protection** (Backend)
   - Origin whitelist validation
   - Rejects unauthorized domains
   - Configurable via `ALLOWED_ORIGINS` env var

**Environment Secrets:**
- `API_SECRET` — Backend API key
- `ALLOWED_ORIGINS` — Comma-separated allowed domains
- `VITE_API_KEY` — Client-side API key (injected at build time)

---

## Development

### Prerequisites

- **Node.js** 18+ and npm
- **Cloudflare account** with Workers + D1 access
- **Wrangler CLI** (installed via npm)

### Local Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repo-url>
   cd finance
   npm install
   ```

2. **Configure the API:**
   ```bash
   cd api
   cp wrangler.toml.example wrangler.toml
   # Edit wrangler.toml:
   # - Set database_id (create D1 database first)
   # - Configure API_SECRET and ALLOWED_ORIGINS
   ```

3. **Initialize database:**
   ```bash
   npx wrangler d1 execute finance-db --local --file=schema.sql
   ```

4. **Configure the client:**
   ```bash
   cd ../client
   # Create .env.local file:
   echo "VITE_API_KEY=your-api-key-here" > .env.local
   echo "VITE_API_DOMAIN=localhost:8787" >> .env.local
   ```

5. **Run development servers:**
   ```bash
   cd ..
   npm run dev
   # API: http://localhost:8787
   # Client: http://localhost:5173
   ```

### Environment Variables

**API (wrangler.toml secrets):**
```toml
[vars]
API_SECRET = "your-secret-key"
ALLOWED_ORIGINS = "http://localhost:5173,https://finance.yourdomain.com"
```

**Client (.env.local):**
```bash
VITE_API_KEY=your-secret-key
VITE_API_DOMAIN=localhost:8787  # or api.yourdomain.com for prod
```

---

## API Documentation

**Base URL**: `https://api.finance.yourdomain.com`

**Authentication**: Include `X-API-Key` header in all requests.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/version` | API version |
| **Accounts** |  |  |
| `GET` | `/accounts` | List all accounts |
| `POST` | `/accounts` | Create account |
| `PUT` | `/accounts/:id` | Update account |
| `DELETE` | `/accounts/:id` | Delete account |
| **Transactions** |  |  |
| `GET` | `/transactions` | List all transactions |
| `GET` | `/transactions/paginated` | Get paginated transactions |
| `GET` | `/transactions/date-range` | Get transactions by date range |
| `GET` | `/transactions/from-date` | Get transactions from a specific date |
| `POST` | `/transactions` | Create transaction |
| `PUT` | `/transactions/:id` | Update transaction |
| `DELETE` | `/transactions/:id` | Delete transaction |
| **Categories** |  |  |
| `GET` | `/categories` | List categories |
| `POST` | `/categories` | Create category |
| `PUT` | `/categories/:id` | Update category |
| `DELETE` | `/categories/:id` | Delete category |
| `POST` | `/categories/reset` | Reset categories to defaults |
| **Investment Transactions** |  |  |
| `GET` | `/investment-transactions` | List investment transactions |
| `POST` | `/investment-transactions` | Create investment transaction |
| `DELETE` | `/investment-transactions/:id` | Delete investment transaction |
| **Transfers** |  |  |
| `GET` | `/transfers/exchange-rate` | Get exchange rate between currencies |
| `POST` | `/transfers` | Create transfer between accounts |
| **Dashboard** |  |  |
| `GET` | `/dashboard/net-worth` | Calculate net worth |
| **Market Data** |  |  |
| `GET` | `/market/search` | Search for stocks/crypto symbols |
| `GET` | `/market/quote` | Get current price quote |
| `GET` | `/market/chart` | Get historical price chart data |

**Example Request:**
```bash
curl -H "X-API-Key: your-key" \
     https://api.finance.yourdomain.com/accounts
```

---

**API Version**: 1.1.4  
**Client Version**: 0.0.0  
**License**: MIT  
**Maintained by**: apptrackit

---

## Additional Resources

- **[API Architecture Documentation](api/ARCHITECTURE.md)** — Detailed documentation of the clean architecture pattern used in the API
- **Deployment Script** — Automated deployment with `./deploy.sh`
- **Database Schema** — See `api/schema.sql` for complete database structure
- **PWA Configuration** — See `client/vite.config.ts` for Progressive Web App setup
