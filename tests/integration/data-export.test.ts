import { expect, it } from 'vitest'
import { EXPORT_TABLES, isDataExport, MAX_EXPORT_ROWS_PER_TABLE, type DataExport } from '../../shared/data-export'
import { useFinanceWorkers } from './harness'

const f = useFinanceWorkers()

it('exports every durable table and transaction state with stored links and financial metadata intact', async () => {
  await f.seed()
  await f.db.batch([
    f.db.prepare(`INSERT INTO accounts (id, name, type, balance, currency, quote_currency, symbol, asset_type, is_locked, exclude_from_net_worth, exclude_from_cash_balance)
      VALUES ('stock', 'Test stock', 'investment', 0.125, 'SHARE', 'USD', 'TEST', 'stock', 1, 1, 1)`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, category_id, amount, description, date, status, pending_kind, review_source, review_batch_id, review_flags, linked_transaction_id, exclude_from_estimate, created_at, updated_at)
      VALUES ('transfer-out', 'cash', NULL, -20, 'Test exchange', '2026-01-01', 'posted', 'upcoming', 'manual', NULL, '[]', 'transfer-in', 1, 1, 2)`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, linked_transaction_id)
      VALUES ('transfer-in', 'savings', 20, '2026-01-01', 'transfer-out')`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, category_id, amount, description, date, status)
      VALUES ('upcoming', 'cash', 'food', -10, 'Future expense', '2099-01-01', 'pending')`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, category_id, amount, description, date, status, pending_kind, review_source, review_batch_id, review_flags)
      VALUES ('review', 'cash', 'food', -15, 'Review expense', '2026-01-01', 'pending', 'mcp_review', 'chatgpt_mcp', 'batch', '["duplicate"]')`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, status, cancelled_at)
      VALUES ('cancelled', 'cash', -5, '2026-01-01', 'cancelled', 3)`),
    f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, linked_transaction_id)
      VALUES ('purchase-cash', 'cash', -12.5, '2026-01-01', 'buy')`),
    f.db.prepare(`INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, notes, created_at)
      VALUES ('buy', 'stock', 'buy', 0.125, 100, 12.5, '2026-01-01', 'Fractional holding', 1)`),
    f.db.prepare(`INSERT INTO recurring_schedules (id, type, frequency, month, day_of_month, account_id, to_account_id, amount, amount_to, description, is_active, created_at, last_processed_date, remaining_occurrences, end_date)
      VALUES ('schedule', 'transfer', 'yearly', 11, 31, 'cash', 'savings', 20, 20, 'Annual transfer', 0, 1, '2025-12-31', 2, '2028-12-31')`),
    f.db.prepare(`INSERT INTO app_settings VALUES ('navigation.visible_menus', '{"dashboard":true,"analytics":false}', 2)`),
    f.db.prepare(`INSERT INTO audit_log VALUES ('audit', 'CREATE', 'transaction', 'review', '{"source":"chatgpt_mcp"}', 1)`),
    f.db.prepare(`INSERT INTO financial_outlook_snapshots VALUES ('snapshot', 'snapshot-key', 'payload-hash', 1, 'HUF', 2, '2026-01-01T00:00:00Z', 1, 'Test forecast', 80, 'high', '{"daily_series":[]}', '{"cash":true}')`),
    f.db.prepare(`INSERT INTO mcp_draft_batches VALUES ('batch', 'hash', 1)`),
    f.db.prepare(`INSERT INTO mcp_draft_correction_runs VALUES ('correction', 'hash', 1)`),
    f.db.prepare(`INSERT INTO mcp_transfer_correction_runs VALUES ('transfer-correction', 'hash', 1)`),
    f.db.prepare(`INSERT INTO mcp_draft_proposals VALUES ('secret-proposal-id', 'hash', '[]', 1, 2, NULL)`),
  ])
  const balances = await f.balances()
  const response = await f.request('/export')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const exported = await response.json() as DataExport
  expect(isDataExport(exported)).toBe(true)
  expect(exported).toMatchObject({ exportVersion: 1, schemaVersion: '015-yearly-recurring-month', manifest: { restoreSupported: false } })
  expect(new Date(exported.exportedAt).toISOString()).toBe(exported.exportedAt)
  expect(exported.migrations).toHaveLength(15)
  for (const table of EXPORT_TABLES) {
    const stored = (await f.db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'app_settings' ? 'key' : 'id'}`).all()).results
    expect(exported.data[table], table).toEqual(stored)
    expect(exported.manifest.tables[table].rowCount, table).toBe(stored.length)
  }
  expect(exported.data.transactions).toHaveLength(6)
  expect(exported.data.transactions).toContainEqual(expect.objectContaining({ id: 'review', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp', review_batch_id: 'batch', review_flags: '["duplicate"]' }))
  expect(exported.data.investment_transactions).toContainEqual(expect.objectContaining({ id: 'buy', quantity: 0.125 }))
  expect(exported.manifest.excluded).toHaveProperty('mcp_draft_proposals')
  expect(JSON.stringify(exported)).not.toContain('secret-proposal-id')
  expect(JSON.stringify(exported)).not.toContain('integration-test-key')
  expect(await f.balances()).toEqual(balances)
  // The ordinary API still exposes the posted ledger only.
  expect(await (await f.request('/transactions')).json()).toHaveLength(3)
})

it('rejects failed reads instead of returning a partial export, and requires normal API authentication', async () => {
  expect((await f.api.fetch('/export', { headers: { Origin: 'https://finance.test' } })).status).toBe(401)
  await f.db.prepare('DROP TABLE audit_log').run()
  const response = await f.request('/export')
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR', error: 'The data export could not read every table. Please retry.' })
})

it('rejects a table over the row limit without silently truncating it', async () => {
  await f.db.prepare(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ?)
    INSERT INTO categories (id, name, type) SELECT printf('category-%05d', value), printf('Test category %05d', value), 'expense' FROM n`)
    .bind(MAX_EXPORT_ROWS_PER_TABLE + 1).run()
  const response = await f.request('/export')
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('exceeds 10000 rows in categories') })
})


it('refuses oversized JSON instead of returning an incomplete file', async () => {
  const details = 'x'.repeat(1024 * 1024)
  await f.db.batch(Array.from({ length: 16 }, (_, index) => f.db.prepare(
    "INSERT INTO audit_log VALUES (?, 'CREATE', 'transaction', 'synthetic', ?, 1)"
  ).bind(`audit-${index}`, details)))
  const response = await f.request('/export')
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('exceeds 16 MiB') })
})
