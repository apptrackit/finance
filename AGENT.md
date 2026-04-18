# AGENT.md — Finance Manager

This file guides future Claude sessions working on this codebase.

---

## Project Overview

Personal finance manager built on **Cloudflare Workers + D1** (API) and **React 19 + Vite** (client). Deployed to Cloudflare Workers (API) and Cloudflare Pages (frontend).

- **`api/`** — Hono-based backend, TypeScript, runs on Cloudflare Workers
- **`client/`** — React 19 + Tailwind CSS 4, deployed to Cloudflare Pages
- **`api/migrations/`** — D1 SQLite migrations (001–004), applied in order via `deploy.sh`

---

## Architecture

### Backend (`api/src/`)

Layered clean architecture — do not bypass layers:

```
Request → Middleware → Controller → Service → Repository → D1
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Middleware | `middlewares/` | auth, CORS, rate limiting, validation |
| Controller | `controllers/` | parse request, call service, return response |
| Service | `services/` | business logic |
| Repository | `repositories/` | all D1 queries, typed with `D1Value = string \| number \| null` |
| Validators | `validators/` | Zod schemas for every mutation endpoint |
| Errors | `errors/codes.ts` | `AppError` class + `ErrorCode` const — always use these |
| Logger | `utils/logger.ts` | structured JSON logger — never use `console.log` directly |
| Models | `models/` | TypeScript interfaces for DB rows |

### Frontend (`client/src/`)

| File/Dir | Responsibility |
|----------|----------------|
| `App.tsx` | Root layout, navigation (desktop sidebar + mobile bottom nav), route switching |
| `hooks/useFinanceData.ts` | All data fetching, state, and mutation callbacks — single source of truth |
| `components/` | Feature modules: dashboard, accounts, analytics, settings, etc. |
| `config.ts` | `API_BASE_URL`, `apiFetch` (auth-aware fetch wrapper) |
| `context/` | React context providers |

---

## Key Rules

### Do not touch `investment_transactions`
This table and all related code (`investment-transaction.repository.ts`, `investment-transaction.service.ts`, `InvestmentTransactionController`) are **actively in use** for buy/sell tracking. Do not modify, deprecate, or remove.

### Error handling
Always throw `AppError` (not plain `Error`) in controllers and services. The global `app.onError` handler in `index.ts` converts `AppError` to structured JSON responses. Use `ErrorCode` constants from `errors/codes.ts`.

```typescript
throw AppError.notFound('ACCOUNT_NOT_FOUND', `Account ${id} not found`)
throw AppError.validation('Amount must be non-zero')
throw AppError.internal('DB query failed')
```

### Validation
Every POST/PUT route must use `validateBody(Schema)` middleware. Schemas live in `validators/`. Add a new validator file for any new entity; import the schema in `index.ts` and wire it to the route.

### Logging
Use `logger` from `utils/logger.ts`:

```typescript
logger.info('accounts fetched', { count: rows.length })
logger.error('failed to create account', { error: err.message })
```

### Repository typing
D1 returns raw row objects. When writing repository queries that return boolean columns, define a `RawXxxRow` type with `0 | 1` instead of `boolean`, then cast in the mapper. Use `D1Value = string | number | null` for parameterized query arrays.

### Rate limiting
`rate-limit.middleware.ts` uses in-memory sliding window per Worker instance. This is per-instance, not globally distributed. For true global enforcement, use Cloudflare's native rate limiting rules in the dashboard.

---

## Database Migrations

Migrations are in `api/migrations/`. They are applied by `deploy.sh` in order. When adding a new migration:

1. Name it `00N-description.sql`
2. Use `IF NOT EXISTS` and `IF EXISTS` guards so they are idempotent
3. Apply remotely: `npx wrangler d1 execute finance-db --remote --file=api/migrations/00N-description.sql`

Current migrations:
- `001-init.sql` — full schema (accounts, transactions, categories, investment_transactions, recurring_schedules)
- `002-budgets.sql` — budgets table
- `003-indexes.sql` — performance indexes on hot query columns
- `004-audit.sql` — audit_log table

---

## Testing

### API tests (`api/`)
```bash
cd api && npm test
```
Test files live in `api/src/tests/`. Tests are pure unit tests (no D1 dependency); they test validators and error classes directly.

### Client tests (`client/`)
```bash
cd client && npm test
```
Test files live in `client/src/test/`. Uses `@testing-library/react` + `jsdom`. Mock `apiFetch` via `vi.mock('../config')`.

---

## Security Model

Three-layer authentication:
1. **Cloudflare Access** — zero-trust identity layer (outermost)
2. **X-API-Key header** — checked in `auth.middleware.ts` against `env.API_KEY`
3. **CORS origin whitelist** — `cors.middleware.ts` checks `Origin` against `env.ALLOWED_ORIGIN`

CSP and other security headers are set in `client/public/_headers` (Cloudflare Pages `_headers` file).

---

## Adding a New Entity

1. Add D1 table in a new migration file
2. Create `models/NewEntity.ts` interface
3. Create `repositories/new-entity.repository.ts` (typed, uses `D1Value[]`)
4. Create `services/new-entity.service.ts`
5. Create `validators/new-entity.validator.ts` (Zod schema)
6. Create `controllers/new-entity.controller.ts` (uses `AppError`, `logger`)
7. Wire up in `api/src/index.ts`: import, instantiate, add routes with `validateBody()`
8. Add audit logging calls in controller create/update/delete methods
9. Add tests in `api/src/tests/`

---

## Common Commands

```bash
# Run API locally (starts local D1 + Wrangler dev)
cd api && npm run dev

# Run frontend dev server
cd client && npm run dev

# Run all tests
cd api && npm test
cd client && npm test

# Deploy everything
./deploy.sh finance-client

# Apply a new migration remotely
npx wrangler d1 execute finance-db --remote --file=api/migrations/004-audit.sql

# TypeScript check (client)
cd client && npx tsc --noEmit
```

---

## Worktree & Branch Notes

Active development branch: `feature/comprehensive-improvements`
This branch was used for a large batch of improvements committed in sequence. When the PR is merged, future work should branch from `main`.
