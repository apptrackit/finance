# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run both servers concurrently (from root)
npm run dev
# API: http://localhost:8787  |  Client: http://localhost:5173

# Run only one server
cd api && npm run dev        # starts local D1 + Wrangler dev server
cd client && npm run dev     # starts Vite dev server

# Tests
cd api && npm test           # vitest run (validators, error codes)
cd client && npm test        # vitest run (hooks, components)
cd api && npm run test:watch
cd client && npm run test:watch

# TypeScript check (client)
cd client && npx tsc --noEmit

# Lint (client)
cd client && npm run lint

# Deploy everything
./deploy.sh finance-client

# Apply a migration remotely
npx wrangler d1 execute finance-db --remote --file=api/migrations/00N-description.sql
```

## Architecture

### Backend (`api/src/`)

Strict layered architecture — never bypass layers:

```
Request → Middleware → Controller → Service → Repository → D1
```

- **`middlewares/`** — auth (`X-API-Key`), CORS, rate limiting (in-memory sliding window), `validateBody(Schema)` for POST/PUT
- **`controllers/`** — parse request, call service, return response; use `AppError` and `logger` here
- **`services/`** — business logic only
- **`repositories/`** — all D1 queries; parameters typed as `D1Value = string | number | null`; boolean columns use `RawXxxRow` with `0 | 1` then mapped
- **`validators/`** — Zod schemas; one file per entity; wired to routes via `validateBody()` in `index.ts`
- **`errors/codes.ts`** — `AppError` class + `ErrorCode` constants; always use these, never plain `Error`
- **`utils/logger.ts`** — structured JSON logger; never use `console.log` directly
- **`models/`** — TypeScript interfaces for DB rows
- **`index.ts`** — entry point: instantiates all controllers, registers routes, global `app.onError`

Error pattern:
```typescript
throw AppError.notFound('ACCOUNT_NOT_FOUND', `Account ${id} not found`)
throw AppError.validation('Amount must be non-zero')
```

### Frontend (`client/src/`)

- **`App.tsx`** — root layout, desktop sidebar + mobile bottom nav, route switching (~280 lines)
- **`hooks/useFinanceData.ts`** — single source of truth for all data fetching, state, and mutation callbacks
- **`config.ts`** — `API_BASE_URL` and `apiFetch` (auth-aware fetch wrapper that injects `X-API-Key`)
- **`context/`** — `PrivacyContext`, `AlertContext`, `LockedAccountsContext`, `ThemeContext`
- **`components/`** — organized by feature module: `analytics-module/`, `budget-module/`, `dashboard-module/`, `investments-module/`, `settings-module/`, `common/`

In development, the client proxies `/api` to `localhost:8787` (configured in `vite.config.ts`). In production, `apiFetch` calls the full Workers URL directly.

### Database

D1 (SQLite at Cloudflare edge). Migrations in `api/migrations/`, applied in order:
- `001-init.sql` — full schema (accounts, transactions, categories, investment_transactions, recurring_schedules)
- `002-budgets.sql` — budgets table
- `003-indexes.sql` — performance indexes on hot query columns
- `004-audit.sql` — audit_log table

New migrations: name `00N-description.sql`, use `IF NOT EXISTS`/`IF EXISTS` guards, apply remotely with `wrangler d1 execute`.

### Security

Three-layer auth: Cloudflare Access (outermost) → `X-API-Key` header → CORS origin whitelist. Security headers (CSP, `X-Frame-Options`, etc.) set in `client/public/_headers`.

## Key Rules

**Do not touch `investment_transactions`** — `investment-transaction.repository.ts`, `investment-transaction.service.ts`, and `InvestmentTransactionController` are actively used for buy/sell tracking.

**Validation** — every POST/PUT route must use `validateBody(Schema)` middleware. Add a new validator file in `validators/` for any new entity.

**Logging** — use `logger` from `utils/logger.ts`, never `console.log`.

**Repository typing** — boolean columns: define `RawXxxRow` with `0 | 1`, cast in mapper. Use `D1Value[]` for all query parameter arrays.

## Adding a New Entity

1. New migration SQL file
2. `models/NewEntity.ts` interface
3. `repositories/new-entity.repository.ts`
4. `services/new-entity.service.ts`
5. `validators/new-entity.validator.ts` (Zod)
6. `controllers/new-entity.controller.ts` (use `AppError`, `logger`, add audit log calls)
7. Wire in `api/src/index.ts`: import, instantiate, add routes with `validateBody()`
8. Tests in `api/src/tests/`

## Environment Setup

**API** — create `api/.dev.vars`:
```
API_SECRET=your-secret-key
ALLOWED_ORIGINS=http://localhost:5173
```

**Client** — create `client/.env.local`:
```
VITE_API_KEY=your-api-key-here
VITE_API_DOMAIN=localhost:8787
```

Client env vars are baked into the JS bundle at build time.
