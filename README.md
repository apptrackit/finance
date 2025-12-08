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

### Tech Stack

**Backend**
- **Runtime**: Cloudflare Workers (serverless, edge-deployed)
- **Framework**: Hono (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Market Data**: Yahoo Finance API v2

**Frontend**
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4 with custom design system
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **State**: React Context API (Privacy, Settings)

### Project Structure

```
finance/
├── api/                      # Backend (Cloudflare Workers)
│   ├── src/
│   │   └── index.ts         # API routes & business logic
│   ├── schema.sql           # Database schema
│   ├── wrangler.toml        # Cloudflare Workers config
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

🌍 **Global Deployment**
- Edge-deployed on Cloudflare network
- Sub-50ms response times worldwide
- Automatic HTTPS and DDoS protection

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
| `GET` | `/accounts` | List all accounts |
| `POST` | `/accounts` | Create account |
| `PUT` | `/accounts/:id` | Update account |
| `DELETE` | `/accounts/:id` | Delete account |
| `GET` | `/transactions` | List transactions |
| `POST` | `/transactions` | Create transaction |
| `DELETE` | `/transactions/:id` | Delete transaction |
| `GET` | `/categories` | List categories |
| `POST` | `/categories` | Create category |
| `GET` | `/dashboard/net-worth` | Calculate net worth |
| `GET` | `/market/quote/:symbol` | Get stock/crypto price |
| `POST` | `/market/refresh-investments` | Refresh all investment prices |

**Example Request:**
```bash
curl -H "X-API-Key: your-key" \
     https://api.finance.yourdomain.com/accounts
```

---

**Version**: 0.8.5 (Client) | 1.0.1 (API)  
**License**: MIT  
**Maintained by**: apptrackit
