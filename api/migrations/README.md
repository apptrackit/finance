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
- `deploy.sh` applies all pending migrations to the remote D1 database
- Migrations already applied are skipped automatically

## For Developers

1. **Never modify applied migrations** - Create a new migration instead
2. **Keep migrations focused** - One logical change per file
3. **Test locally first** - Run `npm run dev` to verify your migration works
4. **Write idempotent migrations** - Use `IF NOT EXISTS` or `IF NOT EXISTS` clauses

## Important

The initial schema (`001-init.sql`) is applied during the first deployment. All subsequent changes must be new migration files.
