-- AI Financial Forecast snapshots are immutable derived analytics records.
-- Financial-source triggers maintain one revision number so snapshots can tell
-- whether they were generated before the underlying ledger changed.

CREATE TABLE IF NOT EXISTS financial_data_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO financial_data_revision (id, revision, updated_at)
VALUES (1, 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE TABLE IF NOT EXISTS financial_outlook_snapshots (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'HUF'),
  source_revision INTEGER NOT NULL,
  source_queried_at TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  headline TEXT NOT NULL,
  data_quality_score INTEGER NOT NULL CHECK (data_quality_score BETWEEN 0 AND 100),
  data_quality_label TEXT NOT NULL CHECK (data_quality_label IN ('high', 'moderate', 'limited')),
  payload TEXT NOT NULL,
  source_coverage TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_financial_outlook_snapshots_created_at
  ON financial_outlook_snapshots(created_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS financial_outlook_snapshots_no_update
BEFORE UPDATE ON financial_outlook_snapshots
BEGIN
  SELECT RAISE(ABORT, 'financial outlook snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS financial_outlook_snapshots_no_delete
BEFORE DELETE ON financial_outlook_snapshots
BEGIN
  SELECT RAISE(ABORT, 'financial outlook snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_accounts_insert
AFTER INSERT ON accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_accounts_update
AFTER UPDATE ON accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_accounts_delete
AFTER DELETE ON accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_transactions_insert
AFTER INSERT ON transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_transactions_update
AFTER UPDATE ON transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_transactions_delete
AFTER DELETE ON transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_categories_insert
AFTER INSERT ON categories BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_categories_update
AFTER UPDATE ON categories BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_categories_delete
AFTER DELETE ON categories BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_budgets_insert
AFTER INSERT ON budgets BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_budgets_update
AFTER UPDATE ON budgets BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_budgets_delete
AFTER DELETE ON budgets BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_budget_accounts_insert
AFTER INSERT ON budget_accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_budget_accounts_delete
AFTER DELETE ON budget_accounts BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_budget_categories_insert
AFTER INSERT ON budget_categories BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_budget_categories_delete
AFTER DELETE ON budget_categories BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_recurring_schedules_insert
AFTER INSERT ON recurring_schedules BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_recurring_schedules_update
AFTER UPDATE ON recurring_schedules BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_recurring_schedules_delete
AFTER DELETE ON recurring_schedules BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS financial_revision_investment_transactions_insert
AFTER INSERT ON investment_transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_investment_transactions_update
AFTER UPDATE ON investment_transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS financial_revision_investment_transactions_delete
AFTER DELETE ON investment_transactions BEGIN
  UPDATE financial_data_revision SET revision = revision + 1, updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 1;
END;
