import { beforeEach, expect, it } from 'vitest'
import { migrate, useFinanceWorkers } from './harness'
import { EXPORT_TABLES } from '../../shared/data-export'
import { holdingNativeValue } from '../../shared/holding'

const f = useFinanceWorkers({ migrateBeforeEach: false })
beforeEach(async () => { await migrate(f.db, 17); await f.seed() })
const date = '2026-01-15'
const holding = (overrides: Record<string, unknown> = {}) => ({ name: 'Synthetic holding', type: 'investment', asset_type: 'etf',
  balance: 2, currency: 'SHARE', quote_currency: 'EUR', pricing_method: 'manual', manual_price: 120,
  opening: { balance: 2, date: '2026-01-10' }, ...overrides })
async function create(body = holding()) {
  const response = await f.request('/accounts', 'POST', body, date)
  const account = await response.json() as Record<string, any>
  expect(response.status, JSON.stringify(account)).toBe(201)
  return account
}
async function account(id: string) {
  const rows = await (await f.request('/accounts')).json() as Record<string, any>[]
  return rows.find(row => row.id === id)!
}
async function counts() {
  return (await f.db.prepare(`SELECT
    (SELECT COUNT(*) FROM audit_log) AS audits,
    (SELECT COUNT(*) FROM investment_position_anchors) AS anchors,
    (SELECT COUNT(*) FROM investment_transactions) AS trades,
    (SELECT COUNT(*) FROM transactions) AS cash,
    (SELECT revision FROM financial_data_revision WHERE id = 1) AS revision`).first())!
}

it('upgrades 017 without changing any old application column/rowid, source revision or ledger fact', async () => {
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,symbol,asset_type,is_locked,updated_at) VALUES ('old','Legacy holding','investment',5,'SHARE','EUR','TEST.DE','stock',1,1)"),
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type) VALUES ('manual','Legacy manual','investment',500,'HUF','manual')"),
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,asset_type) VALUES ('closed','Closed holding','investment',0,'SHARE','stock')"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('old-buy','old','buy',2,10,20,'2026-01-12')"),
    f.db.prepare("UPDATE accounts SET archived_at = 1, updated_at = 1 WHERE id = 'closed'"),
  ])
  const snapshots = []
  for (const table of EXPORT_TABLES.filter(table => !['investment_position_anchors','investment_trade_sequence','investment_valuations'].includes(table))) {
    const columns = (await f.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results.map(column => column.name)
    const rows = (await f.db.prepare(`SELECT rowid, ${columns.join(',')} FROM ${table} ORDER BY rowid`).all()).results
    snapshots.push({ table, columns, rows })
  }
  await migrate(f.db)
  for (const { table, columns, rows } of snapshots) {
    expect((await f.db.prepare(`SELECT rowid, ${columns.join(',')} FROM ${table} ORDER BY rowid`).all()).results, table).toEqual(rows)
  }
  const anchors = (await f.db.prepare('SELECT kind,cost_amount,cost_currency,balance FROM investment_position_anchors ORDER BY account_id').all()).results
  expect(anchors).toEqual([
    { kind: 'observed', cost_amount: null, cost_currency: null, balance: 0 },
    { kind: 'observed', cost_amount: null, cost_currency: null, balance: 500 },
    { kind: 'observed', cost_amount: null, cost_currency: null, balance: 5 },
  ])
  expect(await account('old')).toMatchObject({ balance: 5, asset_type: 'stock', quote_currency: 'EUR', pricing_method: 'market', unit: 'SHARE',
    holding_position: { quantity: 5, activity_quantity: 2, residual: 3, history_status: 'mismatch', anchor: { kind: 'observed', cost_amount: null } } })
  expect(await account('manual')).toMatchObject({ balance: 500, currency: 'HUF', pricing_method: 'manual', unit: 'ITEM' })
  expect(await f.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] })
  expect(await f.db.prepare('PRAGMA quick_check').first('quick_check')).toBe('ok')
})

it('persists ETF/stock/crypto/manual categories independently of pricing and returns identical API/MCP current units', async () => {
  await migrate(f.db)
  const etf = await create()
  const stock = await create(holding({ asset_type: 'stock', symbol: 'TEST', balance: 0, pricing_method: 'market', manual_price: null, exchange: 'TESTEX', opening: { balance: 0, date: '2026-01-10' } }))
  const crypto = await create(holding({ asset_type: 'crypto', currency: 'BTC', balance: 0.000001, manual_price: 65000, opening: { balance: 0.000001, date: '2026-01-10' } }))
  const manual = await create(holding({ asset_type: 'manual', currency: 'HUF', quote_currency: undefined, balance: 500, manual_price: null, opening: { balance: 500, date: '2026-01-10', cost_amount: 400, cost_currency: 'HUF' } }))
  expect(etf).toMatchObject({ asset_type: 'etf', pricing_method: 'manual', unit: 'SHARE', manual_price: 120, quote_currency: 'EUR', provider: null })
  expect(stock).toMatchObject({ provider: 'yahoo', exchange: 'TESTEX', unit: 'SHARE' })
  expect(manual).toMatchObject({ unit: 'ITEM', currency: 'HUF', balance: 500, pricing_method: 'manual' })
  const summary = await f.tool<{ accounts: Record<string, any>[] }>('get_accounts_summary', { currency: 'HUF' })
  const portfolio = await f.tool<{ holdings: Record<string, any>[]; total_value: number }>('get_portfolio', { currency: 'HUF' })
  for (const a of [etf, stock, crypto, manual]) {
    const mcp = summary.accounts.find(row => row.id === a.id)!
    expect(mcp.holding_position).toEqual(a.holding_position)
    expect(mcp.pricing_method).toBe(a.pricing_method)
    expect(mcp.investment_quantity).toBe(a.asset_type === 'manual' ? null : a.balance)
    const p = portfolio.holdings.find(row => row.account_id === a.id)!
    expect(p.quantity).toBe(a.asset_type==='manual'?1:a.holding_position.quantity)
    expect(p.native_value).toBe(holdingNativeValue(a as any).value)
    expect(p.net_invested).toBe(a.balance===0?0:null) // Only a zero start proves no earlier funding.
  }
  expect(portfolio.total_value).toBeCloseTo(96526)
  expect(await counts()).toMatchObject({ anchors: 4, trades: 0, cash: 0, audits: 4 })
})

it.each([
  { balance: -1 }, { balance: 1e-13 }, { balance: 1e13 },
  { opening: { balance: 2, date: '2026-02-30' } },
  { opening: { balance: 2, date: '2026-01-16' } },
  { opening: undefined }, { opening: { balance: 1, date: '2026-01-10' } },
  { currency: 'EUR' }, { quote_currency: 'SHARE' },
  { opening: { balance: 2, date: '2026-01-10', cost_amount: 10 } },
])('rejects invalid new holding input atomically: %j', async patch => {
  await migrate(f.db)
  const before = await counts()
  expect((await f.request('/accounts', 'POST', holding(patch))).status).toBe(400)
  expect(await counts()).toEqual(before)
  expect((await f.db.prepare("SELECT id FROM accounts WHERE type = 'investment'").all()).results).toEqual([])
})

it('uses the client calendar for zero openings and future date rejection, and stores confirmed zero prices', async () => {
  await migrate(f.db)
  const a = await create(holding({ balance: 0, manual_price: 0, opening: undefined }))
  expect(a.holding_position.anchor.effective_date).toBe('2026-01-14')
  expect(holdingNativeValue(a as any).value).toBe(0)
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { manual_price: 12, manual_price_date: '2026-01-16' })).status).toBe(400)
})

it('rolls back account, opening and source revision if the audit fails', async () => {
  await migrate(f.db)
  const before = await counts()
  await f.db.prepare("CREATE TRIGGER fail_account_audit BEFORE INSERT ON audit_log WHEN NEW.entity = 'account' BEGIN SELECT RAISE(ABORT, 'injected'); END").run()
  expect((await f.request('/accounts', 'POST', holding())).status).toBe(500)
  expect(await counts()).toEqual(before)
  expect((await f.db.prepare("SELECT id FROM accounts WHERE type = 'investment'").all()).results).toEqual([])
})

it('keeps legacy missing currency metadata intact during unrelated edits and safely recategorizes stock as ETF', async () => {
  await f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,symbol,asset_type,updated_at) VALUES ('old','Old','investment',2,'SHARE','TEST','stock',1)").run()
  await migrate(f.db)
  expect((await f.request('/accounts/old', 'PUT', { name: 'Renamed' })).status).toBe(200)
  expect(await account('old')).toMatchObject({ name: 'Renamed', quote_currency: null, balance: 2 })
  expect((await f.request('/accounts/old', 'PUT', { asset_type: 'etf' })).status).toBe(200)
  expect(await account('old')).toMatchObject({ asset_type: 'etf', quote_currency: null, balance: 2 })
})

it('rejects history-reinterpreting edits without an audit, balance or revision change', async () => {
  await migrate(f.db)
  const a = await create(holding({ symbol: 'TEST' }))
  for (const patch of [{ quote_currency: 'USD' }, { symbol: 'OTHER' }, { currency: 'BTC', asset_type: 'crypto' }, { exchange: 'OTHER' }, { pricing_method: 'market' }, { type: 'cash' }]) {
    const before = await counts()
    const response = await f.request(`/accounts/${a.id}`, 'PUT', patch)
    expect(response.status, JSON.stringify(await response.json())).toBe(409)
    expect(await counts()).toEqual(before)
  }
})

it('reconciles a confirmed dated opening without changing current units, transactions or cash', async () => {
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,symbol,asset_type,updated_at) VALUES ('old','Old','investment',5,'SHARE','EUR','TEST','stock',1)"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('old-buy','old','buy',2,10,20,'2026-01-12')"),
  ])
  await migrate(f.db)
  const before = await counts()
  expect((await f.request('/accounts/old', 'PUT', { expected_balance: 5, opening: { balance: 4, date: '2026-01-10' } })).status).toBe(409)
  expect(await counts()).toEqual(before)
  const response = await f.request('/accounts/old', 'PUT', { expected_balance: 5, opening: { balance: 3, date: '2026-01-10', cost_amount: 30, cost_currency: 'EUR' } })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ balance: 5, holding_position: { quantity: 5, residual: 0, history_status: 'reconciled', anchor: { balance: 3, cost_amount: 30 } } })
  expect(await counts()).toMatchObject({ cash: before.cash, trades: before.trades, anchors: Number(before.anchors) + 1, audits: Number(before.audits) + 1 })
})

it('guards stale/concurrent corrections and never creates an ordinary income/expense row', async () => {
  await migrate(f.db)
  const a = await create()
  const before = await counts()
  const responses = await Promise.all([3, 4].map(balance => f.request(`/accounts/${a.id}`, 'PUT', { balance, expected_balance: 2, expected_updated_at: a.updated_at })))
  expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  expect([3, 4]).toContain((await account(a.id)).balance)
  expect(await counts()).toMatchObject({ cash: 0, trades: 0, anchors: Number(before.anchors) + 1, audits: Number(before.audits) + 1 })
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { balance: 5, adjustWithTransaction: true })).status).toBe(400)
})

it('rolls back corrections and preserves drafts financial facts when the anchor write fails', async () => {
  await migrate(f.db)
  const a = await create()
  const before = await counts()
  await f.db.prepare("CREATE TRIGGER fail_anchor BEFORE INSERT ON investment_position_anchors BEGIN SELECT RAISE(ABORT, 'injected'); END").run()
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { balance: 3, expected_balance: 2 })).status).toBe(500)
  expect((await account(a.id)).balance).toBe(2)
  expect(await counts()).toEqual(before)
})

it('preserves lock/archive protections on new metadata and anchor writers', async () => {
  await migrate(f.db)
  const a = await create(holding({ balance: 0, opening: { balance: 0, date: '2026-01-10' } }))
  await f.request(`/accounts/${a.id}/lock`, 'PATCH')
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { manual_price: 2 })).status).toBe(409)
  await expect(f.db.prepare('UPDATE accounts SET manual_price = 2 WHERE id = ?').bind(a.id).run()).rejects.toThrow('ACCOUNT_LOCKED')
  await f.request(`/accounts/${a.id}/unlock`, 'PATCH')
  await f.request(`/accounts/${a.id}/archive`, 'PATCH')
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { opening: { balance: 0, date: '2026-01-10' } })).status).toBe(409)
  await expect(f.db.prepare('UPDATE accounts SET exchange = ? WHERE id = ?').bind('OTHER', a.id).run()).rejects.toThrow('ACCOUNT_ARCHIVED')
  await f.request(`/accounts/${a.id}/restore`, 'PATCH')
  expect((await f.request(`/accounts/${a.id}`, 'PUT', { name: 'Restored holding' })).status).toBe(200)
})

it('rejects even one minimum unit of opening mismatch and preserves known manual cost on appraisal', async () => {
  await migrate(f.db)
  const tiny = await create(holding({ asset_type: 'crypto', currency: 'BTC', balance: 1e-12, opening: { balance: 1e-12, date: '2026-01-10' } }))
  expect((await f.request(`/accounts/${tiny.id}`, 'PUT', { opening: { balance: 0, date: '2026-01-10' }, expected_balance: 1e-12 })).status).toBe(409)
  const total = await create(holding({ asset_type: 'manual', currency: 'HUF', quote_currency: undefined, balance: 500, manual_price: null, opening: { balance: 500, date: '2026-01-10', cost_amount: 400, cost_currency: 'HUF' } }))
  const before = await counts()
  const updated = await f.request(`/accounts/${total.id}/valuations`, 'PUT', { effective_date: date, amount:600,expected_version:0,expected_id:null })
  expect(updated.status).toBe(200)
  expect(await account(total.id)).toMatchObject({ balance: 600, holding_position: { anchor: { kind: 'opening', cost_amount: 400, cost_currency: 'HUF' } } })
  expect(await counts()).toMatchObject({ cash: before.cash, trades: before.trades })
})

it('does not confirm a dated opening over unresolved future-dated legacy trades', async () => {
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,asset_type,updated_at) VALUES ('future','Future legacy','investment',2,'SHARE','EUR','stock',1)"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('future-buy','future','buy',2,10,20,'2026-01-16')"),
  ])
  await migrate(f.db)
  const before = await counts()
  expect((await f.request('/accounts/future', 'PUT', { opening: { balance: 0, date: '2026-01-10' } })).status).toBe(400)
  expect(await counts()).toEqual(before)
})

it('does not label past investment execution currency from current account metadata', async () => {
  await f.db.batch([
    f.db.prepare("INSERT INTO accounts (id,name,type,balance,currency,quote_currency,symbol,asset_type,updated_at) VALUES ('legacy-currency','Legacy currency','investment',1,'SHARE','EUR','TEST','stock',1)"),
    f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('legacy-trade','legacy-currency','buy',1,10,10,'2026-01-10')"),
  ])
  await migrate(f.db)
  const activity = await f.tool<{ activities: Record<string, unknown>[] }>('get_investment_activity', {})
  expect(activity.activities[0]).toMatchObject({ account_quote_currency: 'EUR', transaction_currency: null, execution_currency_status: 'unverified' })
})
