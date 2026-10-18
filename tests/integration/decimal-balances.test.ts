import { beforeEach, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

const f = useFinanceWorkers()
beforeEach(async () => {
  await f.seed()
  await f.db.prepare("UPDATE accounts SET balance=0 WHERE id='cash'").run()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price) VALUES('holding','Synthetic precision holding','investment',0,'SHARE','HUF','etf','manual','SHARE',1)",
    ),
    f.db.prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('zero','holding','opening','2026-01-01',0,1,0)",
    ),
  ])
})
const balance = (id = 'cash') =>
  f.db
    .prepare('SELECT balance FROM accounts WHERE id=?')
    .bind(id)
    .first<number>('balance')
async function post(amount: number, date = '2026-01-10') {
  const r = await f.request('/transactions', 'POST', {
    account_id: 'cash',
    amount,
    date,
  })
  expect(r.status, await r.clone().text()).toBe(201)
  return r.json() as Promise<{ id: string }>
}
const draft = (patch: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  holding_account_id: 'holding',
  cash_account_id: 'cash',
  type: 'buy',
  quantity: 1,
  price: 0.1,
  execution_currency: 'HUF',
  cash_amount: 0.1,
  fee_status: 'known',
  fee_amount: 0,
  date: '2026-01-10',
  ...patch,
})
async function facts() {
  return Promise.all(
    [
      'accounts',
      'transactions',
      'investment_transactions',
      'investment_position_anchors',
      'audit_log',
      'financial_data_revision',
      'investment_trade_operations',
      'investment_trade_sequence',
    ].map(
      async (t) =>
        (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all())
          .results,
    ),
  )
}
it('posts, edits and deletes decimal cash without accumulating binary residue', async () => {
  await post(0.1)
  const t = await post(0.2)
  expect(await balance()).toBe(0.3)
  expect(
    (await f.request(`/transactions/${t.id}`, 'PUT', { amount: 0.7 })).status,
  ).toBe(200)
  expect(await balance()).toBe(0.8)
  expect((await f.request(`/transactions/${t.id}`, 'DELETE')).status).toBe(200)
  expect(await balance()).toBe(0.1)
  for (let i = 0; i < 10; i++) {
    const t = await post(0.2)
    await f.request(`/transactions/${t.id}`, 'DELETE')
  }
  expect(await balance()).toBe(0.1)
})
it('recovers ledger-supported cash residue only in a successful audited trade', async () => {
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status) VALUES('a','cash',.1,'2026-01-02','posted'),('b','cash',.2,'2026-01-03','posted')",
    ),
    f.db
      .prepare("UPDATE accounts SET balance=? WHERE id='cash'")
      .bind(0.1 + 0.2),
  ])
  const before = await facts()
  await f.request('/accounts')
  expect(await facts()).toEqual(before)
  const r = await f.request('/investment-trades', 'POST', draft())
  expect(r.status, await r.clone().text()).toBe(201)
  const trade = (await r.json()) as { trade_id: string }
  expect(await balance()).toBe(0.2)
  expect(
    (
      await f.request(
        `/investment-trades/${trade.trade_id}?expected_version=1`,
        'DELETE',
      )
    ).status,
  ).toBe(200)
  expect(await balance()).toBe(0.3)
  expect(
    await f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE entity='account' AND details LIKE '%decimal_recovery%'",
      )
      .first('n'),
  ).toBeGreaterThan(0)
})
it('retains nine-decimal crypto units while recovering narrowly supported old residue', async () => {
  const quantity = 0.312345678,
    stored = 0.31234567800000006
  await f.db.batch([
    f.db.prepare("UPDATE accounts SET balance=10 WHERE id='cash'"),
    f.db
      .prepare(
        "UPDATE accounts SET asset_type='crypto',currency='BTC',unit='BTC',balance=? WHERE id='holding'",
      )
      .bind(stored),
    f.db.prepare(
      "DELETE FROM investment_position_anchors WHERE account_id='holding'",
    ),
    f.db
      .prepare(
        "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,effective_order) VALUES('old','holding','buy',?,1,?,'2026-01-02',1)",
      )
      .bind(quantity, quantity),
    f.db
      .prepare(
        "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('observed','holding','observed','2026-01-03',?,1,1)",
      )
      .bind(stored),
    f.db.prepare('UPDATE investment_trade_sequence SET last_order=1'),
  ])
  const r = await f.request(
    '/investment-trades',
    'POST',
    draft({ quantity: 0.000000001, price: 10000000, cash_amount: 0.01 }),
  )
  expect(r.status, await r.clone().text()).toBe(201)
  const ids = (await r.json()) as { trade_id: string }
  expect(await balance('holding')).toBe(0.312345679)
  expect(
    (
      await f.request(
        `/investment-trades/${ids.trade_id}?expected_version=1`,
        'DELETE',
      )
    ).status,
  ).toBe(200)
  expect(await balance('holding')).toBe(quantity)
  expect(
    await f.db
      .prepare("SELECT quantity FROM investment_transactions WHERE id='old'")
      .first('quantity'),
  ).toBe(quantity)
  expect(
    await f.db
      .prepare(
        "SELECT balance FROM investment_position_anchors WHERE id='observed'",
      )
      .first('balance'),
  ).toBe(stored)
})
it('preserves meaningful sub-cent cash instead of rounding every balance to cents', async () => {
  await f.db
    .prepare("UPDATE accounts SET balance=.123456789012 WHERE id='cash'")
    .run()
  await post(0.000000000001)
  expect(await balance()).toBe(0.123456789013)
})
it('refuses a lost cash increment before inserting a ledger row', async () => {
  await f.db
    .prepare("UPDATE accounts SET balance=10000000000000000 WHERE id='cash'")
    .run()
  const before = await facts()
  expect(
    (
      await f.request('/transactions', 'POST', {
        account_id: 'cash',
        amount: 1,
        date: '2026-01-10',
      })
    ).status,
  ).toBe(400)
  expect(await facts()).toEqual(before)
})
it('records exact decimal account adjustments and requires exact split totals', async () => {
  await post(0.1)
  expect(
    (
      await f.request('/accounts/cash', 'PUT', {
        balance: 0.3,
        adjustWithTransaction: true,
      })
    ).status,
  ).toBe(200)
  expect(await balance()).toBe(0.3)
  expect(
    await f.db
      .prepare('SELECT amount FROM transactions ORDER BY rowid DESC LIMIT 1')
      .first('amount'),
  ).toBe(0.2)
  const split = (amount: number) => ({
    id: crypto.randomUUID(),
    amount,
    category_id: 'food',
    description: 'Synthetic decimal adjustment',
    date: '2026-01-10',
  })
  expect(
    (
      await f.request('/accounts/cash', 'PUT', {
        balance: 0.6,
        adjustWithTransaction: true,
        splitTransactions: [split(0.1), split(0.2)],
      })
    ).status,
  ).toBe(200)
  expect(await balance()).toBe(0.6)
  const before = await facts()
  expect(
    (
      await f.request('/accounts/cash', 'PUT', {
        balance: 0.9,
        adjustWithTransaction: true,
        splitTransactions: [split(0.1), split(0.2000000001)],
      })
    ).status,
  ).toBe(400)
  expect(await facts()).toEqual(before)
})
it('allows explicit non-ledger corrections without requiring a representable ledger delta', async () => {
  await f.db
    .prepare("UPDATE accounts SET balance=1000000000000 WHERE id='cash'")
    .run()
  expect(
    (
      await f.request('/accounts/cash', 'PUT', {
        balance: 0.123456789012,
        adjustWithTransaction: false,
      })
    ).status,
  ).toBe(200)
  expect(await balance()).toBe(0.123456789012)
  expect(
    await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n'),
  ).toBe(0)
})
it('confirms decimal pending cash once and keeps future rows isolated', async () => {
  await post(0.1)
  const t = await post(0.2, '2026-01-15') // explicitly pending below
  await f.request(`/transactions/${t.id}`, 'DELETE')
  const r = await f.request('/transactions', 'POST', {
    account_id: 'cash',
    amount: 0.2,
    date: '2026-01-10',
    status: 'pending',
  })
  const p = (await r.json()) as { id: string }
  expect(await balance()).toBe(0.1)
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.request(`/transactions/${p.id}/confirm`, 'POST'),
    ),
  )
  expect(responses.every((r) => r.status === 200)).toBe(true)
  expect(await balance()).toBe(0.3)
  await post(0.5, '2026-01-16')
  expect(await balance()).toBe(0.3)
})
it('keeps decimal cash transfer legs exact through edit and deletion', async () => {
  await f.db.prepare("UPDATE accounts SET balance=.3 WHERE id='cash'").run()
  await f.db.prepare("UPDATE accounts SET balance=.1 WHERE id='savings'").run()
  const r = await f.request('/transfers', 'POST', {
    from_account_id: 'cash',
    to_account_id: 'savings',
    amount_from: 0.2,
    amount_to: 0.2,
    date: '2026-01-10',
  })
  expect(r.status).toBe(201)
  const ids = (await r.json()) as { outgoing_transaction_id: string }
  expect(await balance()).toBe(0.1)
  expect(await balance('savings')).toBe(0.3)
  expect(
    (
      await f.request(`/transactions/${ids.outgoing_transaction_id}`, 'PUT', {
        amount: 0.1,
        amount_to: 0.1,
      })
    ).status,
  ).toBe(200)
  expect(await balance()).toBe(0.2)
  expect(await balance('savings')).toBe(0.2)
  await f.request(`/transactions/${ids.outgoing_transaction_id}`, 'DELETE')
  expect(await balance()).toBe(0.3)
  expect(await balance('savings')).toBe(0.1)
})
it('does not turn unsupported true holding precision into a rounded position', async () => {
  const genuine = 0.3123456780001
  await f.db.batch([
    f.db.prepare("UPDATE accounts SET balance=10 WHERE id='cash'"),
    f.db
      .prepare("UPDATE accounts SET balance=? WHERE id='holding'")
      .bind(genuine),
    f.db.prepare(
      "DELETE FROM investment_position_anchors WHERE account_id='holding'",
    ),
    f.db
      .prepare(
        "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,effective_order) VALUES('precise','holding','buy',?,1,?,'2026-01-02',1)",
      )
      .bind(genuine, genuine),
    f.db
      .prepare(
        "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('observed','holding','observed','2026-01-03',?,1,1)",
      )
      .bind(genuine),
    f.db.prepare('UPDATE investment_trade_sequence SET last_order=1'),
  ])
  const before = await facts()
  expect((await f.request('/investment-trades', 'POST', draft())).status).toBe(
    400,
  )
  expect(await facts()).toEqual(before)
})
it('rolls back a planned cash residue recovery when its financial write fails', async () => {
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status) VALUES('a','cash',.1,'2026-01-02','posted'),('b','cash',.2,'2026-01-03','posted')",
    ),
    f.db
      .prepare("UPDATE accounts SET balance=? WHERE id='cash'")
      .bind(0.1 + 0.2),
    f.db.prepare(
      "CREATE TRIGGER fail_decimal_cash BEFORE UPDATE OF balance ON accounts BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END",
    ),
  ])
  const before = await facts()
  expect(
    (
      await f.request('/transactions', 'POST', {
        account_id: 'cash',
        amount: 0.1,
        date: '2026-01-10',
      })
    ).status,
  ).toBe(500)
  expect(await facts()).toEqual(before)
})
it('posts recurring decimal cash once with its occurrence and audit', async () => {
  await f.db.prepare("UPDATE accounts SET balance=.1 WHERE id='cash'").run()
  await f.db
    .prepare(
      "INSERT INTO recurring_schedules(id,type,frequency,account_id,amount,is_active,created_at,remaining_occurrences) VALUES('decimal-schedule','transaction','daily','cash',.2,1,1,1)",
    )
    .run()
  expect((await f.request('/test-scheduled-task', 'POST')).status).toBe(200)
  expect(await balance()).toBe(0.3)
  const once = await facts()
  await f.request('/test-scheduled-task', 'POST')
  expect(await facts()).toEqual(once)
  expect(
    await f.db
      .prepare(
        "SELECT remaining_occurrences FROM recurring_schedules WHERE id='decimal-schedule'",
      )
      .first('remaining_occurrences'),
  ).toBe(0)
})
it('preserves different concurrent fractional cash/trade deltas', async () => {
  await f.db.prepare("UPDATE accounts SET balance=.3 WHERE id='cash'").run()
  const responses = await Promise.all([
    f.request('/transactions', 'POST', {
      account_id: 'cash',
      amount: 0.1,
      date: '2026-01-10',
    }),
    f.request('/transactions', 'POST', {
      account_id: 'cash',
      amount: 0.2,
      date: '2026-01-10',
    }),
    f.request('/investment-trades', 'POST', draft()),
  ])
  expect(responses.map((r) => r.status)).toEqual([201, 201, 201])
  expect(await balance()).toBe(0.5)
  expect(await balance('holding')).toBe(1)
})
it('retains a real fractional opening even with large cent-valued ledger history', async () => {
  await f.db.batch([
    f.db.prepare("UPDATE accounts SET balance=2.280001 WHERE id='cash'"),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status) VALUES('large-in','cash',1000000000,'2026-01-02','posted'),('large-out','cash',-999999997.72,'2026-01-03','posted')",
    ),
  ])
  await post(0.1)
  expect(await balance()).toBe(2.380001)
})
it('does not infer a cash opening from nearby but unreproduced ledger totals', async () => {
  const stored = 0.3000000000000001
  await f.db.batch([
    f.db.prepare("UPDATE accounts SET balance=? WHERE id='cash'").bind(stored),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status) VALUES('a','cash',.1,'2026-01-02','posted'),('b','cash',.2,'2026-01-03','posted')",
    ),
  ])
  await post(0.1)
  expect(await balance()).toBe(0.4000000000000001)
})
it('leaves net-zero category/description edits from silently recovering a balance', async () => {
  await f.db.batch([
    f.db
      .prepare("UPDATE accounts SET balance=? WHERE id='cash'")
      .bind(0.1 + 0.2),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status) VALUES('a','cash',.1,'2026-01-02','posted'),('b','cash',.2,'2026-01-03','posted')",
    ),
  ])
  await f.request('/transactions/a', 'PUT', {
    description: 'Nonfinancial edit',
  })
  expect(await balance()).toBe(0.1 + 0.2)
})
it('keeps MCP transfer review pending, then confirms both decimal legs once', async () => {
  await f.db.prepare("UPDATE accounts SET balance=.3 WHERE id='cash'").run()
  await f.db.prepare("UPDATE accounts SET balance=.2 WHERE id='savings'").run()
  const p = await f.tool<{ proposal_id: string }>(
    'prepare_mcp_transfer_drafts',
    {
      items: [
        {
          from_account_id: 'cash',
          to_account_id: 'savings',
          amount: 0.1,
          date: '2026-01-10',
        },
      ],
    },
  )
  const made = await f.tool<{
    drafts: { outgoing_id: string; incoming_id: string }[]
  }>('create_mcp_transfer_drafts', { proposal_id: p.proposal_id })
  const ids = made.drafts[0]
  expect(await balance()).toBe(0.3)
  expect(await balance('savings')).toBe(0.2)
  expect(
    (await f.request(`/transactions/${ids.outgoing_id}/confirm`, 'POST'))
      .status,
  ).toBe(200)
  expect(
    (await f.request(`/transactions/${ids.incoming_id}/confirm`, 'POST'))
      .status,
  ).toBe(200)
  expect(await balance()).toBe(0.2)
  expect(await balance('savings')).toBe(0.3)
})
