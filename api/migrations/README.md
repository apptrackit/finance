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
