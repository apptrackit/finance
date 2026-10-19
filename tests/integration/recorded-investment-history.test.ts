import { beforeEach, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'
const f = useFinanceWorkers()
beforeEach(async () => {
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price,manual_price_date) VALUES('holding','Synthetic recorded history','investment',6,'SHARE','HUF','etf','manual','SHARE',12,'2026-01-01')",
    ),
    f.db.prepare(
      "INSERT INTO transactions(id,account_id,amount,date,status,linked_transaction_id) VALUES('buy-cash','cash',-100,'2026-01-03','posted','buy'),('sell-cash','cash',50,'2026-01-06','posted','sell')",
    ),
    f.db.prepare(
      "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,linked_transaction_id,effective_order) VALUES('buy','holding','buy',10,10,100,'2026-01-03','buy-cash',1),('sell','holding','sell',4,12.5,50,'2026-01-06','sell-cash',2)",
    ),
    f.db.prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('observed','holding','observed','2026-01-14',6,1,2)",
    ),
    f.db.prepare(
      "INSERT INTO investment_valuations(id,account_id,effective_date,kind,amount,currency,source,version,created_at,updated_at) VALUES('price','holding','2026-01-01','per_unit',12,'HUF','initial',1,1,1)",
    ),
    f.db.prepare('UPDATE investment_trade_sequence SET last_order=2'),
  ])
})
async function facts() {
  return Promise.all(
    [
      'accounts',
      'transactions',
      'investment_transactions',
      'investment_position_anchors',
      'investment_valuations',
      'audit_log',
      'financial_data_revision',
    ].map(
      async (t) =>
        (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all())
          .results,
    ),
  )
}
async function read(path: string) {
  const r = await f.request(path)
  expect(r.status, await r.clone().text()).toBe(200)
  return r.json() as Promise<any>
}
it('uses matching recorded units, verified legacy cash and dated history on API/MCP without rewriting facts', async () => {
  const before = await facts()
  const a = (await read('/accounts')).find((a: any) => a.id === 'holding')
  expect(a.holding_position).toMatchObject({
    history_status: 'reconciled',
    anchor: { kind: 'observed' },
    recorded_history: {
      first_trade_date: '2026-01-03',
      quantity: 6,
      trade_count: 2,
    },
  })
  const m = await read('/investment-metrics'),
    h = m.by_currency.HUF.holdings[0]
  expect(h).toMatchObject({
    quantity: 6,
    value: 72,
    remaining_basis: 60,
    realized_gain: 10,
    unrealized_gain: 12,
    total_gain: 22,
    net_invested: 50,
  })
  expect(h.coverage.cost).not.toContain('unknown_opening')
  expect(m.trades.find((t: any) => t.id === 'buy')).toMatchObject({
    cash_source: 'linked_transaction',
    cash_amount: 100,
    cash_currency: 'HUF',
  })
  expect(h.native.remaining_basis).toBeNull() // No invented legacy execution/fee facts.
  const p = await f.tool<any>('get_portfolio', { currency: 'HUF' })
  expect(p.holdings[0]).toMatchObject({
    quantity: 6,
    remaining_basis: 60,
    net_invested: 50,
    gain_loss: 22,
  })
  const history = await read(
    '/investment-history?from=2026-01-02&to=2026-01-10&currency=HUF&timezone=UTC',
  )
  expect(history.opening.value).toBe(0)
  expect(history.points.find((p: any) => p.date === '2026-01-03').value).toBe(
    120,
  )
  expect(history.points.find((p: any) => p.date === '2026-01-06').value).toBe(
    72,
  )
  expect(history.summary.gain).toBe(22)
  expect(await facts()).toEqual(before)
})
it('preserves usable units for standalone legacy buys without guessing cash or execution currency', async () => {
  await f.db.batch([
    f.db.prepare(
      "UPDATE investment_transactions SET linked_transaction_id=NULL WHERE account_id='holding'",
    ),
    f.db.prepare(
      "UPDATE transactions SET linked_transaction_id=NULL WHERE id IN ('buy-cash','sell-cash')",
    ),
  ])
  const before = await facts(),
    m = await read('/investment-metrics'),
    h = m.by_currency.HUF.holdings[0]
  expect(h.quantity).toBe(6)
  expect(h.net_invested).toBeNull()
  expect(h.remaining_basis).toBeNull()
  expect(h.coverage.cost).toContain('unknown_cash_flow')
  expect(h.coverage.cost).not.toContain('unknown_opening')
  expect(m.trades.find((t: any) => t.id === 'buy').cash_source).toBeUndefined()
  expect(await facts()).toEqual(before)
})
it('does not infer units for mismatches, future history or explicit corrections', async () => {
  await f.db.prepare("UPDATE accounts SET balance=7 WHERE id='holding'").run()
  expect(
    (await read('/accounts')).find((a: any) => a.id === 'holding')
      .holding_position.recorded_history,
  ).toBeUndefined()
  await f.db.batch([
    f.db.prepare("UPDATE accounts SET balance=6 WHERE id='holding'"),
    f.db.prepare(
      "UPDATE investment_transactions SET date='2999-01-16' WHERE id='buy'",
    ),
  ])
  expect(
    (await read('/investment-metrics')).accounts[0].holding_position
      .recorded_history,
  ).toBeUndefined()
  await f.db
    .prepare(
      "UPDATE investment_transactions SET date='2026-01-03' WHERE id='buy'",
    )
    .run()
  await f.db
    .prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('corrected','holding','correction','2026-01-15',6,2,2)",
    )
    .run()
  expect(
    (await read('/accounts')).find((a: any) => a.id === 'holding')
      .holding_position.recorded_history,
  ).toBeUndefined()
})
it('starts a new zero-unit holding with trades and supports its first earlier purchase without an opening date', async () => {
  const r = await f.request('/accounts', 'POST', {
    name: 'Zero start',
    type: 'investment',
    asset_type: 'crypto',
    currency: 'COIN',
    quote_currency: 'HUF',
    pricing_method: 'manual',
    manual_price: 20,
    balance: 0,
  })
  expect(r.status, await r.clone().text()).toBe(201)
  const a = (await r.json()) as any
  expect(a.holding_position.anchor.kind).toBe('observed')
  const input = {
    idempotency_key: crypto.randomUUID(),
    holding_account_id: a.id,
    cash_account_id: 'cash',
    type: 'buy',
    quantity: 0.123456789,
    price: 10000000,
    execution_currency: 'HUF',
    cash_amount: 1234567.89,
    fee_status: 'known',
    fee_amount: 0,
    date: '2026-01-03',
  }
  const before = await facts(),
    preview = await f.request('/investment-trades/preview', 'POST', input)
  expect(preview.status, await preview.clone().text()).toBe(200)
  expect(
    ((await preview.json()) as any).by_currency.HUF.holdings[0].quantity,
  ).toBe(0.123456789)
  expect(await facts()).toEqual(before)
  const saved = await f.request('/investment-trades', 'POST', input)
  expect(saved.status, await saved.clone().text()).toBe(201)
  expect(
    (await read('/accounts')).find((row: any) => row.id === a.id)
      .holding_position.recorded_history.first_trade_date,
  ).toBe('2026-01-03')
})
it('retains precise new-input and imported-start requirements', async () => {
  const before = await facts()
  const r = await f.request('/accounts', 'POST', {
    name: 'Imported',
    type: 'investment',
    asset_type: 'etf',
    currency: 'SHARE',
    quote_currency: 'HUF',
    pricing_method: 'manual',
    balance: 2,
  })
  expect(r.status).toBe(400)
  expect(await facts()).toEqual(before)
})

it.each(['pending', 'date', 'reciprocal', 'duplicate'] as const)(
  'refuses unsupported legacy cash evidence: %s',
  async (kind) => {
    if (kind === 'pending')
      await f.db
        .prepare("UPDATE transactions SET status='pending' WHERE id='buy-cash'")
        .run()
    if (kind === 'date')
      await f.db
        .prepare(
          "UPDATE transactions SET date='2026-01-04' WHERE id='buy-cash'",
        )
        .run()
    if (kind === 'reciprocal')
      await f.db
        .prepare(
          "UPDATE transactions SET linked_transaction_id=NULL WHERE id='buy-cash'",
        )
        .run()
    if (kind === 'duplicate')
      await f.db
        .prepare(
          "INSERT INTO transactions(id,account_id,amount,date,status,linked_transaction_id) VALUES('other','cash',-100,'2026-01-03','posted','buy')",
        )
        .run()
    const before = await facts(),
      m = await read('/investment-metrics')
    expect(m.by_currency.HUF.holdings[0].net_invested).toBeNull()
    expect(await facts()).toEqual(before)
  },
)
it('replays all recorded history when refusing an oversell or deleting a purchase needed by a later sale', async () => {
  const before = await facts()
  const sale = await f.request('/investment-trades', 'POST', {
    idempotency_key: crypto.randomUUID(),
    holding_account_id: 'holding',
    cash_account_id: 'cash',
    type: 'sell',
    quantity: 7,
    price: 10,
    execution_currency: 'HUF',
    cash_amount: 70,
    fee_status: 'known',
    fee_amount: 0,
    date: '2026-01-10',
  })
  expect(sale.status).toBe(409)
  const removed = await f.request(
    '/investment-trades/buy?expected_version=0',
    'DELETE',
  )
  expect(removed.status).toBe(409)
  expect(await facts()).toEqual(before)
})

it('protects legacy payment currency without a migration or financial changes',async()=>{
 const before=await facts()
 const response=await f.request('/accounts/cash','PUT',{currency:'USD'})
 expect(response.status).toBe(400)
 expect((await response.json() as any).error).toContain('protect this account currency')
 expect(await facts()).toEqual(before)
})
