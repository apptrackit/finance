import { beforeEach, describe, expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'

const f = useFinanceWorkers({ migrateBeforeEach: false })
async function account(id = 'empty', type = 'cash', currency = 'HUF', balance = 0) {
  await f.db.prepare('INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(id, `Test ${id}`, type, balance, currency).run()
}
const tx = { account_id: 'empty', amount: -10, date: '2026-01-15' }

describe('archived accounts across both Workers and D1', () => {
  beforeEach(async () => { await migrate(f.db); await account() })

  it('archives/restores idempotently, retains history, pauses both schedule legs, audits and revises forecasts', async () => {
    await account('other')
    await f.db.batch([
      f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status) VALUES ('old', 'empty', -10, '2026-01-01', 'posted')"),
      f.db.prepare("INSERT INTO recurring_schedules (id, type, frequency, account_id, to_account_id, amount, created_at, is_active) VALUES ('source', 'transfer', 'daily', 'empty', 'other', 10, 1, 1)"),
      f.db.prepare("INSERT INTO recurring_schedules (id, type, frequency, account_id, to_account_id, amount, created_at, is_active) VALUES ('destination', 'transfer', 'daily', 'other', 'empty', 10, 1, 1)"),
    ])
    const revision = await f.db.prepare('SELECT revision FROM financial_data_revision').first<number>('revision')
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request('/accounts/empty/archive', 'PATCH')))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(await responses[0].json()).toMatchObject({ archived_at: expect.any(Number), balance: 0 })
    expect((await f.db.prepare('SELECT is_active FROM recurring_schedules').all()).results).toEqual([{ is_active: 0 }, { is_active: 0 }])
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE entity_id = ?').bind('empty').first('n')).toBe(1)
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision').first<number>('revision')).toBeGreaterThan(revision!)
    expect(await (await f.request('/transactions')).json()).toMatchObject([{ id: 'old' }])
    expect(await (await f.request('/export')).json()).toMatchObject({ data: { accounts: expect.arrayContaining([expect.objectContaining({ id: 'empty', archived_at: expect.any(Number) })]), transactions: expect.arrayContaining([expect.objectContaining({ id: 'old' })]) } })
    const dimensions = await f.tool<{ accounts: unknown[] }>('list_finance_dimensions', {})
    expect(dimensions.accounts).toContainEqual(expect.objectContaining({ id: 'empty', available_for_new_activity: false }))
    const history = await f.tool<{ series: unknown[] }>('get_balance_trend', { start_date: '2025-12-31', end_date: '2026-01-02', include_accounts: true })
    expect(history.series[0]).toMatchObject({ date: '2025-12-31', cash_balance: 10 })
    expect(JSON.stringify(history)).toContain('empty')
    for (let i = 0; i < 2; i++) expect((await f.request('/accounts/empty/restore', 'PATCH')).status).toBe(200)
    expect((await f.db.prepare('SELECT is_active FROM recurring_schedules').all()).results).toEqual([{ is_active: 0 }, { is_active: 0 }])
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE entity_id = ?').bind('empty').first('n')).toBe(2)
  })

  it('rejects nonzero cash, market positions, manual assets, locks and missing accounts', async () => {
    await account('cash', 'cash', 'EUR', 1)
    await account('stock', 'investment', 'SHARE', 0.000001)
    await account('manual', 'investment', 'HUF', -1)
    for (const id of ['cash', 'stock', 'manual']) {
      const response = await f.request(`/accounts/${id}/archive`, 'PATCH')
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'ACCOUNT_ARCHIVE_NONZERO' })
    }
    await f.request('/accounts/empty/lock', 'PATCH')
    expect((await f.request('/accounts/empty/archive', 'PATCH')).status).toBe(409)
    await f.request('/accounts/empty/unlock', 'PATCH')
    expect((await f.request('/accounts/empty/archive', 'PATCH')).status).toBe(200)
    expect((await f.request('/accounts/missing/archive', 'PATCH')).status).toBe(404)
    expect((await f.request('/accounts/missing/restore', 'PATCH')).status).toBe(404)
  })

  it('requires resolution of upcoming and MCP transfer reviews before archival', async () => {
    const response = await f.request('/transactions', 'POST', { ...tx, status: 'pending' })
    expect(response.status).toBe(201)
    const pending = await response.json() as { id: string }
    expect((await f.request('/accounts/empty/archive', 'PATCH')).status).toBe(409)
    await f.request(`/transactions/${pending.id}/decline`, 'POST')
    await account('other')
    const proposal = await f.tool<{ proposal_id: string }>('prepare_mcp_transfer_drafts', { items: [{ from_account_id: 'empty', to_account_id: 'other', amount: 10, date: '2026-01-15' }] })
    await f.tool('create_mcp_transfer_drafts', { proposal_id: proposal.proposal_id })
    for (const id of ['empty', 'other']) expect((await f.request(`/accounts/${id}/archive`, 'PATCH')).status).toBe(409)
    expect(await f.db.prepare('SELECT archived_at FROM accounts WHERE id = ?').bind('empty').first('archived_at')).toBe(null)
  })

  it('rejects API and MCP writes, including stale prepared proposals, while keeping reads usable', async () => {
    await account('other')
    await account('asset', 'investment', 'SHARE')
    const proposal = await f.tool<{ proposal_id: string }>('prepare_mcp_transaction_drafts', { items: [{ type: 'expense', account_id: 'empty', amount: 10, date: '2026-01-15' }] })
    expect((await f.request('/accounts/empty/archive', 'PATCH')).status).toBe(200)
    expect((await f.request('/accounts/asset/archive', 'PATCH')).status).toBe(200)
    for (const [path, method, body] of [
      ['/transactions', 'POST', tx],
      ['/accounts/empty', 'PUT', { name: 'Changed' }],
      ['/accounts/empty/lock', 'PATCH', undefined],
      ['/accounts/empty', 'DELETE', undefined],
      ['/transfers', 'POST', { from_account_id: 'other', to_account_id: 'empty', amount_from: 10, amount_to: 10, date: '2026-01-15' }],
      ['/investment-transactions', 'POST', { account_id: 'asset', type: 'buy', quantity: 1, price: 10, total_amount: 10, date: '2026-01-15' }],
    ] as const) expect((await f.request(path, method, body)).status, path).toBe(409)
    await expect(f.tool('create_mcp_transaction_drafts', { proposal_id: proposal.proposal_id })).rejects.toThrow('archived')
    await expect(f.tool('prepare_mcp_transfer_drafts', { items: [{ from_account_id: 'other', to_account_id: 'empty', amount: 10, date: '2026-01-15' }] })).rejects.toThrow('archived')
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(0)
    expect((await f.balances()).every(row => row.balance === 0)).toBe(true)
    expect((await f.request('/accounts')).status).toBe(200)
  })

  it('guards direct D1 writes and schedule reactivation, rolls failed archive back atomically', async () => {
    await f.db.prepare("INSERT INTO recurring_schedules (id, type, frequency, account_id, amount, created_at) VALUES ('daily', 'transaction', 'daily', 'empty', -10, 1)").run()
    await f.db.prepare("CREATE TRIGGER reject_pause BEFORE UPDATE ON recurring_schedules WHEN NEW.is_active = 0 BEGIN SELECT RAISE(ABORT, 'injected pause failure'); END").run()
    expect((await f.request('/accounts/empty/archive', 'PATCH')).status).toBe(500)
    expect(await f.db.prepare('SELECT archived_at FROM accounts WHERE id = ?').bind('empty').first('archived_at')).toBe(null)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM audit_log').first('n')).toBe(0)
    await f.db.prepare('DROP TRIGGER reject_pause').run()
    await f.request('/accounts/empty/archive', 'PATCH')
    await expect(f.db.prepare("INSERT INTO transactions (id, account_id, amount, date) VALUES ('bad', 'empty', 10, '2026-01-15')").run()).rejects.toThrow('ACCOUNT_ARCHIVED')
    await expect(f.db.prepare("UPDATE accounts SET balance = 1 WHERE id = 'empty'").run()).rejects.toThrow('ACCOUNT_ARCHIVED')
    await expect(f.db.prepare("UPDATE recurring_schedules SET is_active = 1 WHERE id = 'daily'").run()).rejects.toThrow('ACCOUNT_ARCHIVED')
    expect((await f.request('/test-scheduled-task', 'POST')).status).toBe(200)
    expect(await f.db.prepare('SELECT last_processed_date FROM recurring_schedules WHERE id = ?').bind('daily').first('last_processed_date')).toBe(null)
  })

  it('persists trading currency and independent exclusions through the new account drawer contract', async () => {
    const created = await f.request('/accounts', 'POST', { name: 'Test holding', type: 'investment', asset_type: 'stock', symbol: 'TEST', currency: 'SHARE', quote_currency: 'EUR', balance: 0, exclude_from_net_worth: true })
    expect(created.status).toBe(201)
    const holding = await created.json() as { id: string }
    expect(await f.db.prepare('SELECT quote_currency, exclude_from_net_worth FROM accounts WHERE id = ?').bind(holding.id).first()).toEqual({ quote_currency: 'EUR', exclude_from_net_worth: 1 })
    const updated = await f.request(`/accounts/${holding.id}`, 'PUT', { quote_currency: 'GBP', exclude_from_net_worth: false })
    expect(await updated.json()).toMatchObject({ quote_currency: 'GBP', exclude_from_net_worth: false })
    expect(await f.db.prepare('SELECT quote_currency FROM accounts WHERE id = ?').bind(holding.id).first('quote_currency')).toBe('GBP')
  })

  it('defaults Accounts navigation on for legacy settings and validates visibility writes', async () => {
    await f.db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('navigation.visible_menus', '{\"dashboard\":true,\"analytics\":false}', 1)").run()
    expect(await (await f.request('/settings/navigation')).json()).toMatchObject({ visible_menus: { accounts: true, analytics: false } })
    expect((await f.request('/settings/navigation', 'PUT', { visible_menus: { accounts: false } })).status).toBe(200)
    expect(await (await f.request('/settings/navigation')).json()).toMatchObject({ visible_menus: { accounts: false, analytics: false, dashboard: true } })
    expect((await f.request('/settings/navigation', 'PUT', { visible_menus: { accounts: 'false' } })).status).toBe(400)
    expect((await f.request('/settings/navigation', 'PUT', { visible_menus: { unknown: true } })).status).toBe(400)
  })

  it('blocks deleting accounts with linked transfers and deletes unlinked history atomically', async () => {
    await account('other')
    const transfer = await f.request('/transfers', 'POST', { from_account_id: 'empty', to_account_id: 'other', amount_from: 10, amount_to: 10, date: '2026-01-15' })
    expect(transfer.status).toBe(201)
    const before = await f.balances()
    expect((await f.request('/accounts/empty', 'DELETE')).status).toBe(409)
    expect(await f.balances()).toEqual(before)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(2)
    await account('unlinked')
    await f.request('/transactions', 'POST', { ...tx, account_id: 'unlinked' })
    expect((await f.request('/accounts/unlinked', 'DELETE')).status).toBe(200)
    expect(await f.db.prepare('SELECT id FROM accounts WHERE id = ?').bind('unlinked').first()).toBe(null)
    expect(await f.db.prepare('SELECT id FROM transactions WHERE account_id = ?').bind('unlinked').first()).toBe(null)
  })
})

it('upgrades schema 015 while retaining accounts and historical activity', async () => {
  await migrate(f.db, 15)
  await account('legacy', 'cash', 'EUR', 0)
  await f.db.prepare("INSERT INTO transactions (id, account_id, amount, date) VALUES ('legacy-history', 'legacy', -20, '2026-01-01')").run()
  await migrate(f.db)
  expect(await f.db.prepare('SELECT balance, archived_at FROM accounts WHERE id = ?').bind('legacy').first()).toEqual({ balance: 0, archived_at: null })
  expect((await f.request('/accounts/legacy/archive', 'PATCH')).status).toBe(200)
  expect(await f.db.prepare('SELECT id FROM transactions WHERE account_id = ?').bind('legacy').first()).toEqual({ id: 'legacy-history' })
})
