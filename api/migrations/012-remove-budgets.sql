-- Retire the budget feature and permanently remove its stored data.
DROP TRIGGER IF EXISTS financial_revision_budgets_insert;
DROP TRIGGER IF EXISTS financial_revision_budgets_update;
DROP TRIGGER IF EXISTS financial_revision_budgets_delete;
DROP TRIGGER IF EXISTS financial_revision_budget_accounts_insert;
DROP TRIGGER IF EXISTS financial_revision_budget_accounts_delete;
DROP TRIGGER IF EXISTS financial_revision_budget_categories_insert;
DROP TRIGGER IF EXISTS financial_revision_budget_categories_delete;

DROP TABLE IF EXISTS budget_accounts;
DROP TABLE IF EXISTS budget_categories;
DROP TABLE IF EXISTS budgets;

-- Remove the retired section from persisted navigation preferences.
UPDATE app_settings
SET value = json_remove(value, '$.budget'),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'navigation.visible_menus'
  AND json_valid(value);
