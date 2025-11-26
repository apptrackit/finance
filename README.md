# 💰 Personal Finance Tracker

A secure, self-hosted personal finance app built with React and Cloudflare Workers. Track your accounts, transactions, and view analytics - all running for **FREE** on Cloudflare's infrastructure.

![Security](https://img.shields.io/badge/Security-Cloudflare%20Zero%20Trust-orange)
![Cost](https://img.shields.io/badge/Cost-Free%20Tier-green)
![Database](https://img.shields.io/badge/Database-Cloudflare%20D1-blue)

## ✨ Features

- 📊 **Dashboard** - View total net worth across all accounts
- 🏦 **Accounts** - Track bank accounts, investments, credit cards, crypto
- 💳 **Transactions** - Log income and expenses with categories
- 🔄 **Transfers** - Move money between accounts
- 📈 **Analytics** - Visual charts and spending insights
- 🔒 **Secure** - 3-layer security (Cloudflare Access + CORS + API Key)

## 🏗️ Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19 + Vite + Tailwind CSS |
| Backend | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Hosting | Cloudflare Pages (frontend) + Workers (API) |
| Security | Cloudflare Zero Trust Access |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- npm or pnpm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd finance

# Install all dependencies
npm install
```

### 2. Set Up Local Environment

```bash
# Copy the example config for the API
cp api/.dev.vars.example api/.dev.vars
cp .env.example client/.env.local

# Edit with your values (for local dev, defaults work fine)
nano client/.env.local
```

For local development, set:
```env
VITE_API_KEY=your-secret-key-here
VITE_API_DOMAIN=localhost:8787
```

### 3. Create Local Database

```bash
cd api

# Create local D1 database
npx wrangler d1 create finance-db --local

# Apply schema
npx wrangler d1 execute finance-db --local --file=schema.sql
```

### 4. Run Development Servers

```bash
# Terminal 1: Start API (from /api folder)
cd api
npm run dev

# Terminal 2: Start Frontend (from /client folder)  
cd client
npm run dev
```

Open http://localhost:5173 🎉

---

## 🌐 Production Deployment

### Step 1: Cloudflare Account Setup

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. Add your domain to Cloudflare (or use `*.workers.dev` subdomain)
3. Install Wrangler and login:

```bash
npm install -g wrangler
wrangler login
```

### Step 2: Get Your Account ID

```bash
wrangler whoami
```

Copy the Account ID - you'll need it for configuration.

### Step 3: Create Production Database

```bash
cd api

# Create the D1 database
npx wrangler d1 create finance-db

# You'll see output like:
# Created database 'finance-db' with ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Important:** Copy the database ID!

### Step 4: Configure Your Deployment

Edit these files with YOUR values:

#### `api/wrangler.toml`
```toml
name = "finance-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

# Set to true to get a workers.dev subdomain
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "finance-db"
database_id = "YOUR-DATABASE-ID-HERE"  # <-- Replace this!

# Optional: Custom domain (requires domain in Cloudflare)
# [[routes]]
# pattern = "api.finance.yourdomain.com"
# custom_domain = true
```

#### Configure Environment Variables

**For local development**, edit `api/.dev.vars`:
```env
API_SECRET=your-secret-api-key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**For production**, set secrets via Wrangler:
```bash
cd api

# Set your API key
echo "your-secret-api-key" | npx wrangler secret put API_SECRET

# Set allowed CORS origins (comma-separated, supports wildcards like *.pages.dev)
echo "https://finance.yourdomain.com,https://*.pages.dev" | npx wrangler secret put ALLOWED_ORIGINS
```

#### `client/.env.local` (create this file)
```env
VITE_API_KEY=your-secret-api-key
VITE_API_DOMAIN=your-api-name.your-subdomain.workers.dev
```

**💡 Tip:** Generate a secure API key with:
```bash
openssl rand -base64 16
```

### Step 5: Apply Database Schema

```bash
cd api
npx wrangler d1 execute finance-db --remote --file=schema.sql
```

### Step 6: Deploy API

```bash
cd api
npm run deploy
```

✅ Note the URL (e.g., `finance-api.youraccount.workers.dev`)

### Step 7: Deploy Frontend

```bash
cd client

# Build the frontend
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=finance
```

### Step 9: Set Up Cloudflare Access (Security)

This restricts access to only YOUR devices!

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Applications** → **Add an Application**
3. Choose **Self-hosted**
4. Configure:
   - **Application name:** Finance App
   - **Session Duration:** 24 hours (or your preference)
   - **Application domain:** `finance.yourdomain.com` (your frontend)
5. Add a policy:
   - **Policy name:** Allow Me
   - **Action:** Allow
   - **Include:** Emails - `your@email.com`
6. Save!

Now only your email can access the app after authenticating.

---

## 📁 Configuration Reference

### All Configuration in One Place

| File | Variable | Description |
|------|----------|-------------|
| `api/wrangler.toml` | `database_id` | Your D1 database ID |
| `api/wrangler.toml` | `routes.pattern` | Custom API domain (optional) |
| `api/src/index.ts` | `corsOrigins` | Allowed frontend domains |
| `client/.env.local` | `VITE_API_KEY` | API authentication key |
| `client/.env.local` | `VITE_API_DOMAIN` | API domain (without https://) |
| Cloudflare Dashboard | `API_SECRET` | Workers secret (must match VITE_API_KEY) |

### Environment Variables Summary

```bash
# Frontend (.env.local)
VITE_API_KEY=your-secret-api-key     # Must match API_SECRET
VITE_API_DOMAIN=api.yourdomain.com   # Or: name.account.workers.dev

# Backend (Cloudflare Secrets)
API_SECRET=your-secret-api-key       # Set via: wrangler secret put API_SECRET
```

---

## 🔒 Security Model

This app uses **3 layers of security**:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: Cloudflare Access               │
│         Only authenticated users can reach the frontend     │
│                  (Email verification via OTP)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      LAYER 2: CORS                          │
│     API only accepts requests from your frontend domain     │
│          (Blocks requests from other websites)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 3: API Key                         │
│    Every request must include X-API-Key header              │
│      (Embedded in frontend, verified by Workers)            │
└─────────────────────────────────────────────────────────────┘
```

**Is it hackable?**
- Direct API access: ❌ Blocked (requires API key)
- Browser from other sites: ❌ Blocked (CORS)
- Someone finds your frontend: ❌ Blocked (Cloudflare Access)
- Your authenticated session: ✅ Works!

---

## 🔄 Updating the App

### Pull Latest Changes
```bash
git pull origin main
```

### Redeploy API
```bash
cd api
npm run deploy
```

### Redeploy Frontend
```bash
cd client
npm run build
npx wrangler pages deploy dist --project-name=finance
```

---

## 🆘 Troubleshooting

### "401 Unauthorized" errors
- Check that `VITE_API_KEY` in frontend matches `API_SECRET` in Workers
- Verify the secret is set: `wrangler secret list`

### CORS errors
- Ensure your frontend domain is in the `corsOrigins` array in `api/src/index.ts`
- Redeploy the API after changing CORS settings

### "Database not found"
- Check `database_id` in `wrangler.toml` matches your D1 database
- Verify database exists: `wrangler d1 list`

### Can't access the app
- Check Cloudflare Access policy includes your email
- Try incognito mode to force re-authentication

---

## 💰 Cost

**Everything runs on Cloudflare's free tier:**

| Service | Free Tier Limit | Typical Usage |
|---------|-----------------|---------------|
| Workers | 100,000 requests/day | < 1,000 |
| D1 Database | 5M rows read/day | < 10,000 |
| Pages | Unlimited sites | 1 site |
| Access | 50 users | 1 user |

**Total cost: $0/month** 🎉

---

## 📄 License

MIT License - feel free to fork and customize!

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

---

Made with ❤️ using Cloudflare Workers, React, and Hono
