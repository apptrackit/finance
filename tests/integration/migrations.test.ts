import { expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'

const f = useFinanceWorkers({ migrateBeforeEach: false })

it('builds a fresh schema, records every migration, and does not replay applied ALTERs', async () => {
  await migrate(f.db)
  const history = (await f.db.prepare('SELECT migration_name FROM migration_history ORDER BY migration_name').all()).results
  const files = (await readdir('api/migrations')).filter(name => /^\d+-.*\.sql$/.test(name)).sort()
  expect(history).toEqual(files.map(file => ({ migration_name: file.slice(0, -4) })))
  await f.seed()
  await migrate(f.db)
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
  expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
  expect((await f.db.prepare('SELECT migration_name FROM migration_history ORDER BY migration_name').all()).results).toEqual(history)
  expect((await f.balances())[0].balance).toBe(1000)
})

it('upgrades populated legacy data, retires budgets, and preserves immutable forecasts and revision triggers', async () => {
  await migrate(f.db, 6)
  await f.seed()
  await f.db.batch([
    f.db.prepare("INSERT INTO transactions (id, account_id, category_id, amount, date) VALUES ('legacy', 'cash', 'food', -25, '2026-01-01')"),
    f.db.prepare("INSERT INTO budgets VALUES ('budget', 'Old budget', 100, 'monthly', '2026-01-01', '2026-01-31', 'selected', 'selected', 'HUF', 1, 1)"),
    f.db.prepare("INSERT INTO budget_accounts VALUES ('budget', 'cash')"),
    f.db.prepare("INSERT INTO budget_categories VALUES ('budget', 'food')"),
    f.db.prepare('INSERT INTO app_settings VALUES (?, ?, 1)').bind('navigation.visible_menus', JSON.stringify({ budget: true, dashboard: true, analytics: false })),
  ])
  await migrate(f.db, 11)
  expect(await f.db.prepare("SELECT status, pending_kind, review_source, review_flags FROM transactions WHERE id = 'legacy'").first()).toEqual({ status: 'posted', pending_kind: 'upcoming', review_source: 'manual', review_flags: '[]' })
  // Store a derived record before the final upgrade; its content must survive untouched.
  await f.db.prepare(`INSERT INTO financial_outlook_snapshots VALUES
    ('snapshot', 'snapshot-key', 'hash', 1, 'HUF', 0, '2026-01-01T00:00:00Z', 1, 'Test forecast', 80, 'high', '{}', '{}')`).run()
  await migrate(f.db)
  expect((await f.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('budgets', 'budget_accounts', 'budget_categories')").all()).results).toEqual([])
  expect(JSON.parse((await f.db.prepare("SELECT value FROM app_settings WHERE key = 'navigation.visible_menus'").first('value')) as string)).toEqual({ dashboard: true, analytics: false })
  expect((await f.balances())[0].balance).toBe(1000)
  expect(await f.db.prepare("SELECT amount FROM transactions WHERE id = 'legacy'").first('amount')).toBe(-25)
  const snapshot = await f.db.prepare("SELECT * FROM financial_outlook_snapshots WHERE id = 'snapshot'").first()
  await expect(f.db.prepare("UPDATE financial_outlook_snapshots SET headline = 'changed' WHERE id = 'snapshot'").run()).rejects.toThrow('immutable')
  await expect(f.db.prepare("DELETE FROM financial_outlook_snapshots WHERE id = 'snapshot'").run()).rejects.toThrow('immutable')
  expect(await f.db.prepare("SELECT * FROM financial_outlook_snapshots WHERE id = 'snapshot'").first()).toEqual(snapshot)
  const before = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<number>('revision')
  await f.db.prepare("UPDATE transactions SET amount = -30 WHERE id = 'legacy'").run()
  expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first('revision')).toBe(before! + 1)
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
})

it('upgrades the preceding schema without changing existing MCP review drafts', async () => {
  await migrate(f.db, 12)
  await f.seed()
  await f.db.prepare(`INSERT INTO transactions
    (id, account_id, category_id, amount, description, date, status, pending_kind, review_source, review_flags, created_at, updated_at)
    VALUES ('existing-review', 'cash', 'food', -30, 'Existing review', '2026-01-15',
      'pending', 'mcp_review', 'chatgpt_mcp', '[]', 1, 1)`).run()
  const before = await f.db.prepare('SELECT * FROM transactions WHERE id = ?').bind('existing-review').first()
  await migrate(f.db)
  expect(await f.db.prepare('SELECT * FROM transactions WHERE id = ?').bind('existing-review').first()).toEqual(before)
  const revision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first('revision')
  await f.db.prepare("UPDATE transactions SET description = 'Corrected review' WHERE id = 'existing-review'").run()
  expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first('revision')).toBe(revision)
  await f.db.prepare("UPDATE transactions SET status = 'posted' WHERE id = 'existing-review'").run()
  expect(await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first('revision')).toBe((revision as number) + 1)
})

it('upgrades schema 013 with a linked transfer review intact', async () => {
  await migrate(f.db, 13)
  await f.seed()
  await f.db.batch([
    f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, description, status, pending_kind, review_source, review_batch_id, linked_transaction_id, review_flags, created_at, updated_at)
      VALUES ('transfer-out', 'cash', -20, '2026-01-15', 'Exchange', 'pending', 'mcp_review', 'chatgpt_mcp', 'batch', 'transfer-in', '[]', 1, 1)`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, description, status, pending_kind, review_source, review_batch_id, linked_transaction_id, review_flags, created_at, updated_at)
      VALUES ('transfer-in', 'savings', 20, '2026-01-15', 'Exchange', 'pending', 'mcp_review', 'chatgpt_mcp', 'batch', 'transfer-out', '[]', 1, 1)`),
  ])
  const before = (await f.db.prepare("SELECT * FROM transactions ORDER BY id").all()).results
  await migrate(f.db)
  expect((await f.db.prepare("SELECT * FROM transactions ORDER BY id").all()).results).toEqual(before)
  expect((await f.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('mcp_transfer_correction_proposals', 'mcp_transfer_correction_runs') ORDER BY name").all()).results)
    .toEqual([{ name: 'mcp_transfer_correction_proposals' }, { name: 'mcp_transfer_correction_runs' }])
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
})
import { readdir } from 'node:fs/promises'
