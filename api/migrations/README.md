# Database Migrations

## How It Works

All database changes are managed through versioned SQL migration files. Each migration is executed once and tracked in the `migration_history` table to prevent re-running.

## File Naming Convention

Name migrations as: `NNN-description.sql`
- `NNN`: Sequential number (001, 002, 003, etc.)
- `description`: Brief name of what the migration does

Example: `001-init.sql`, `002-add-user-table.sql`

## Execution Flow

**Local Development:** 
- `npm run dev` in the api directory runs `setup-local-db.sh`
- This applies all migrations to the local SQLite database

**Production Deployment:**
- `npm run deploy` or `npm run deploy:migrations` applies pending migrations through `scripts/deploy.mjs`
- Migrations already applied are skipped automatically
- API/MCP-only deployments check migration history and stop if any are pending. Add `-- --migrations` to explicitly apply them before deploying that Worker.
- A history-query failure stops deployment. Each migration and its history insert are submitted together; do not substitute Wrangler's separate built-in migration ledger.

## For Developers

1. **Never modify applied migrations** - Create a new migration instead
2. **Keep migrations focused** - One logical change per file
3. **Test locally first** - Run `npm run test:integration` for disposable D1 verification, and add a populated upgrade fixture. `npm run dev` deletes existing local API database state.
4. **Write idempotent migrations where possible** - Use `IF EXISTS`/`IF NOT EXISTS` when supported. Do not replay one-time `ALTER TABLE` statements.

## Important

The initial schema (`001-init.sql`) is applied during the first deployment. All subsequent changes must be new migration files.

## Holding metadata upgrade

Migration 018 follows the reciprocal-link foundation in 017. It adds independent holding metadata and observed position anchors without rewriting balances or ledger rows. See [holding setup and migration notes](../../docs/investment-holdings.md) for compatibility, export/source-revision rules and verification boundaries. Apply before deploying its consumers.

Migration **019-investment-trade-facts.sql** extends 018 with nullable execution/fee/settlement facts, stable legacy row order, mutation versions and bounded replay receipts. All pre-existing columns/row IDs and the source revision survive the baseline. Apply before the updated Workers/client. See [trade compatibility and verification](../../docs/investment-trades.md).

Migration **020-manual-investment-valuations.sql** adds dated total/per-unit observations, explicit total-asset opening ownership and acquisition/disposal markers. The baseline preserves all prior columns/row IDs and source revision, including protected history; it invents no old purchase/cost/value trail. Apply after 019 before updated consumers. See [manual values and migration verification](../../docs/manual-investment-valuations.md).

Migration **021-market-data-cache.sql** adds only the bounded reconstructible provider cache, with no financial backfill or financial-source revision trigger. The JSON export manifest explicitly excludes it. Apply after 020 before updated API/MCP consumers; see [market input contracts and verification](../../docs/investment-market-data.md).
