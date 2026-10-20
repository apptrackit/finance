import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'
import { InvestmentTransactionRepository } from '../../api/src/repositories/investment-transaction.repository'
import { TransactionRepository } from '../../api/src/repositories/transaction.repository'

type Pair = { outgoing_transaction_id: string; incoming_transaction_id: string }

describe('reciprocal investment transfers', () => {
  const f = useFinanceWorkers()
  beforeEach(async () => {
    await f.seed()
    await f.db.batch([
      f.db.prepare(`INSERT INTO accounts (id, name, type, balance, currency, quote_currency, asset_type)
        VALUES ('holding', 'Synthetic holding', 'investment', 2, 'SHARE', 'EUR', 'stock')`),
      f.db.prepare(`INSERT INTO accounts (id, name, type, balance, currency, quote_currency, asset_type)
        VALUES ('other-holding', 'Other holding', 'investment', 0, 'SHARE', 'EUR', 'stock')`),
    ])
    await f.db.batch(['holding','other-holding'].map(id => f.db.prepare("INSERT INTO investment_position_anchors (id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) SELECT ?,id,'opening','2026-01-01',balance,1,0 FROM accounts WHERE id = ?").bind(`opening:${id}`,id)))
  })
  const input = { from_account_id: 'cash', to_account_id: 'holding', amount_from: 100,
    amount_to: 0.125, price: 400, execution_currency:'EUR', fee_status:'unknown', fee_amount:null, idempotency_key:crypto.randomUUID(), date: '2026-01-15', description: 'Synthetic purchase' }
  async function purchase() {
    const response = await f.request('/transfers', 'POST', { ...input,idempotency_key:crypto.randomUUID() })
    expect(response.status, await response.clone().text()).toBe(201)
    return response.json() as Promise<Pair>
  }
  async function state() {
    return {
      accounts: (await f.db.prepare('SELECT * FROM accounts ORDER BY id').all()).results,
      cash: (await f.db.prepare('SELECT * FROM transactions ORDER BY id').all()).results,
      trades: (await f.db.prepare('SELECT * FROM investment_transactions ORDER BY id').all()).results,
      audit: (await f.db.prepare('SELECT * FROM audit_log ORDER BY id').all()).results,
      revision: await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first('revision'),
    }
  }

  it('persists and exposes reciprocal IDs through API, bounded history, MCP and JSON export', async () => {
    const pair = await purchase()
    const trade = { id: pair.incoming_transaction_id, linked_transaction_id: pair.outgoing_transaction_id,
      quantity: 0.125, price: 400, total_amount: 50 }
    expect(await (await f.request('/investment-transactions')).json()).toEqual([expect.objectContaining(trade)])
    expect(await (await f.request('/transactions/history')).json()).toMatchObject({
      transactions: [expect.objectContaining({ id: pair.outgoing_transaction_id, amount: -100, linked_transaction_id: pair.incoming_transaction_id })],
      investments: [expect.objectContaining(trade)],
    })
    expect(await f.tool('get_investment_activity', {})).toMatchObject({ activities: [expect.objectContaining(trade)] })
    expect(await (await f.request('/export')).json()).toMatchObject({ data: {
      investment_transactions: [expect.objectContaining(trade)],
      transactions: [expect.objectContaining({ id: pair.outgoing_transaction_id, linked_transaction_id: pair.incoming_transaction_id })],
    } })
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 900 }, { id: 'holding', balance: 2.125 },
      { id: 'other-holding', balance: 0 }, { id: 'savings', balance: 200 }])
    expect(await f.db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'CREATE'").first('count')).toBe(2)
  })

  it.each(['investment_transactions', 'audit_log'])('rolls back pair creation if writing %s fails', async table => {
    const before = await state()
    await f.db.prepare(`CREATE TRIGGER reject_pair BEFORE INSERT ON ${table}
      BEGIN SELECT RAISE(ABORT, 'injected create failure'); END`).run()
    expect((await f.request('/transfers', 'POST', { ...input,idempotency_key:crypto.randomUUID() })).status).toBeGreaterThanOrEqual(400)
    expect(await state()).toEqual(before)
    await f.db.prepare('DROP TRIGGER reject_pair').run()
    await purchase()
  })

  it('adds concurrent purchases to current balances without losing a movement', async () => {
    await Promise.all(Array.from({ length: 4 }, purchase))
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(600)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'holding'").first('balance')).toBe(2.5)
    expect((await state()).trades).toHaveLength(4)
  })

  it('atomically edits both records and all four accounts using exact cash and unit amounts', async () => {
    const pair = await purchase()
    const response = await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', {
      account_id: 'savings', to_account_id: 'other-holding', amount: 150, amount_to: 0.25,
      price: 500, description: 'Corrected purchase', date: '2026-01-14',
    })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'holding', balance: 2 },
      { id: 'other-holding', balance: 0.25 }, { id: 'savings', balance: 50 }])
    const current = await state()
    expect(current.cash).toEqual([expect.objectContaining({ id: pair.outgoing_transaction_id, account_id: 'savings',
      amount: -150, date: '2026-01-14', status: 'posted', linked_transaction_id: pair.incoming_transaction_id })])
    expect(current.trades).toEqual([expect.objectContaining({ id: pair.incoming_transaction_id, account_id: 'other-holding',
      quantity: 0.25, price: 500, total_amount: 125, date: '2026-01-14', linked_transaction_id: pair.outgoing_transaction_id })])
    expect(current.audit.filter(row => row.action === 'UPDATE')).toHaveLength(2)
    expect(JSON.parse(String(current.audit.find(row => row.action === 'UPDATE')!.details))).toMatchObject({
      before: { cash_account_id: 'cash', cash_amount: -100, quantity: 0.125, price: 400 },
      after: { cash_account_id: 'savings', investment_account_id: 'other-holding', cash_amount: -150, quantity: 0.25, price: 500 },
    })
  })

  it.each(['investment_transactions', 'audit_log'])('rolls back an edit if %s fails after balance updates', async table => {
    const pair = await purchase()
    const before = await state()
    await f.db.prepare(`CREATE TRIGGER reject_edit BEFORE ${table === 'audit_log' ? 'INSERT' : 'UPDATE'} ON ${table}
      BEGIN SELECT RAISE(ABORT, 'injected edit failure'); END`).run()
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { amount: 150, amount_to: 0.25, price: 500 })).status).toBe(500)
    expect(await state()).toEqual(before)
  })

  it('guards concurrent and repeated edits against stale balance deltas', async () => {
    const pair = await purchase()
    const edit = () => f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { amount: 150, amount_to: 0.25 })
    const results = await Promise.all(Array.from({ length: 4 }, edit))
    expect(results.some(response => response.status === 200)).toBe(true)
    expect(results.every(response => [200, 409].includes(response.status))).toBe(true)
    expect((await edit()).status).toBe(200)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(850)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'holding'").first('balance')).toBe(2.25)
  })

  it('rejects stale snapshots and accounts locked after the initial read inside the D1 batch', async () => {
    const pair = await purchase()
    const repository = new InvestmentTransactionRepository(f.db)
    const cash = (await new TransactionRepository(f.db).findById(pair.outgoing_transaction_id))!
    const trade = (await repository.findById(pair.incoming_transaction_id))!
    const snapshot = await repository.trades.state(['holding'])
    const staleDelete = () => repository.trades.commit({key:crypto.randomUUID(),hash:'synthetic stale claim',now:Date.now(),state:snapshot,
      result:{trade_id:trade.id,cash_transaction_id:cash.id,type:trade.type,deleted:true},before:{trade,cash},balances:new Map(),anchors:[]})
    await f.request('/accounts/holding/lock', 'PATCH')
    const locked = await state()
    expect(await staleDelete()).toBe(false)
    expect(await staleDelete()).toBe(false)
    expect(await state()).toEqual(locked)
    await f.request('/accounts/holding/unlock', 'PATCH')
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { amount: 175, amount_to: 0.375 })).status).toBe(200)
    const changed = await state()
    expect(await staleDelete()).toBe(false)
    expect(await staleDelete()).toBe(false)
    expect(await state()).toEqual(changed)
  })

  it.each(['cash', 'holding', 'savings', 'other-holding'])('rejects edits with locked account %s without partial writes', async id => {
    const pair = await purchase()
    await f.request(`/accounts/${id}/lock`, 'PATCH')
    const before = await state()
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', {
      account_id: 'savings', to_account_id: 'other-holding', amount: 150, amount_to: 0.25,
    })).status).toBe(409)
    expect(await state()).toEqual(before)
    for (const path of [`/transactions/${pair.outgoing_transaction_id}`, `/investment-transactions/${pair.incoming_transaction_id}`]) {
      if (['cash', 'holding'].includes(id)) {
        expect((await f.request(path, 'DELETE')).status).toBe(409)
        expect(await state()).toEqual(before)
      }
    }
  })

  it('rejects archived destinations and creation from an investment source before any writes', async () => {
    const pair = await purchase()
    expect((await f.request('/accounts/other-holding/archive', 'PATCH')).status).toBe(200)
    const before = await state()
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { to_account_id: 'other-holding' })).status).toBe(409)
    expect((await f.request('/transfers', 'POST', { ...input, from_account_id: 'holding', to_account_id: 'cash' })).status).toBe(400)
    expect((await f.request('/transfers', 'POST', { ...input, to_account_id: 'other-holding' })).status).toBe(409)
    expect(await state()).toEqual(before)
  })

  it.each(['transactions', 'investment_transactions', 'audit_log'])('rolls back deletion through the investment endpoint if %s fails', async table => {
    const pair = await purchase()
    const before = await state()
    await f.db.prepare(`CREATE TRIGGER reject_delete BEFORE ${table === 'audit_log' ? 'INSERT' : 'DELETE'} ON ${table}
      BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END`).run()
    expect((await f.request(`/investment-transactions/${pair.incoming_transaction_id}`, 'DELETE')).status).toBe(500)
    expect(await state()).toEqual(before)
  })

  it('deletes from either endpoint concurrently, reversing each movement and auditing the pair once', async () => {
    const pair = await purchase()
    const paths = [`/transactions/${pair.outgoing_transaction_id}`, `/investment-transactions/${pair.incoming_transaction_id}`]
    const results = await Promise.all([...paths, ...paths].map(path => f.request(path, 'DELETE')))
    expect(results.map(response => response.status)).toEqual([200, 200, 200, 200])
    for (const path of paths) expect((await f.request(path, 'DELETE')).status).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'holding', balance: 2 },
      { id: 'other-holding', balance: 0 }, { id: 'savings', balance: 200 }])
    const current = await state()
    expect(current.cash).toEqual([])
    expect(current.trades).toEqual([])
    expect(current.audit.filter(row => row.action === 'DELETE')).toHaveLength(2)
  })

  it.each(['investment', 'cash'])('rejects a broken %s link without treating either leg as standalone', async side => {
    const pair = await purchase()
    await f.db.prepare(side === 'investment'
      ? 'UPDATE investment_transactions SET linked_transaction_id = NULL WHERE id = ?'
      : 'UPDATE transactions SET linked_transaction_id = NULL WHERE id = ?')
      .bind(side === 'investment' ? pair.incoming_transaction_id : pair.outgoing_transaction_id).run()
    const before = await state()
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { amount: 150 })).status).toBe(409)
    for (const path of [`/transactions/${pair.outgoing_transaction_id}`, `/investment-transactions/${pair.incoming_transaction_id}`]) {
      expect((await f.request(path, 'DELETE')).status).toBe(409)
      expect(await state()).toEqual(before)
    }
  })

  it('keeps existing standalone investment records readable without introducing a cash leg', async () => {
    await f.db.prepare("INSERT INTO investment_transactions (id,account_id,type,quantity,price,total_amount,date) VALUES ('standalone','holding','buy',0.25,400,100,'2026-01-15')").run()
    const before = await state()
    expect((await f.request('/transactions','POST',{account_id:'holding',amount:0.25,price:400,date:'2026-01-15'})).status).toBe(400)
    expect((await f.request('/investment-transactions/standalone','DELETE')).status).toBe(409)
    expect(await state()).toEqual(before)
    expect(await (await f.request('/investment-transactions')).json()).toEqual([expect.objectContaining({id:'standalone',linked_transaction_id:null})])
  })

  it('does not allow manually attaching another cash movement to an investment record', async () => {
    const pair = await purchase()
    const before = await state()
    const response = await f.request('/transactions', 'POST', {
      account_id: 'cash', amount: -100, date: '2026-01-15', linked_transaction_id: pair.incoming_transaction_id,
    })
    expect(response.status).toBe(400)
    expect(await state()).toEqual(before)
  })

  it('rejects legacy IDs shared by cash and investment records before editing or deleting', async () => {
    const pair = await purchase()
    await f.db.batch([
      f.db.prepare('UPDATE investment_transactions SET linked_transaction_id = NULL WHERE id = ?').bind(pair.incoming_transaction_id),
      f.db.prepare(`INSERT INTO transactions (id, account_id, amount, date, linked_transaction_id)
        VALUES (?, 'savings', 50, '2026-01-15', ?)`).bind(pair.incoming_transaction_id, pair.outgoing_transaction_id),
    ])
    const before = await state()
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'PUT', { amount: 150 })).status).toBe(409)
    expect((await f.request(`/transactions/${pair.outgoing_transaction_id}`, 'DELETE')).status).toBe(409)
    expect(await state()).toEqual(before)
  })

  it('preserves sale signs when editing and deleting an existing linked sale', async () => {
    await f.db.batch([
      f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, linked_transaction_id) VALUES ('sale-cash', 'cash', 120, '2026-01-15', 'sale')"),
      f.db.prepare(`INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, linked_transaction_id,effective_order)
        VALUES ('sale', 'holding', 'sell', 0.125, 400, 50, '2026-01-15', 'sale-cash',1)`),
      f.db.prepare("UPDATE accounts SET balance = balance + 120 WHERE id = 'cash'"),
      f.db.prepare("UPDATE accounts SET balance = balance - 0.125 WHERE id = 'holding'"),
    ])
    expect((await f.request('/transactions/sale-cash', 'PUT', { amount: 150, amount_to: 0.25,execution_currency:'EUR',fee_status:'unknown',fee_amount:null })).status).toBe(200)
    expect(await f.db.prepare("SELECT amount FROM transactions WHERE id = 'sale-cash'").first('amount')).toBe(150)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(1150)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'holding'").first('balance')).toBe(1.75)
    expect((await f.request('/investment-transactions/sale', 'DELETE')).status).toBe(200)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'cash'").first('balance')).toBe(1000)
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id = 'holding'").first('balance')).toBe(2)
  })
})
