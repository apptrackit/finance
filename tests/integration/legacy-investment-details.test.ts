import { LegacyInvestmentDetailsRepository } from '../../api/src/repositories/legacy-investment-details.repository'
import { beforeEach, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'
const f = useFinanceWorkers()
beforeEach(async () => {
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price,manual_price_date) VALUES('legacy','Synthetic legacy','investment',2,'SHARE','HUF','stock','manual','SHARE',60,'2026-01-01')",
    ),
    f.db.prepare(
      "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,effective_order) VALUES('old-buy','legacy','buy',2,50,100,'2026-01-03',1)",
    ),
    f.db.prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('old-observation','legacy','observed','2026-01-14',2,1,1)",
    ),
    f.db.prepare(
      "INSERT INTO investment_valuations(id,account_id,effective_date,kind,amount,currency,source,version,created_at,updated_at) VALUES('old-price','legacy','2026-01-01','per_unit',60,'HUF','initial',1,1,1)",
    ),
  ])
})
const path = '/investment-trades/old-buy/legacy-details'
const body = {
  expected_version: 0,
  execution_currency: 'HUF',
  cash_currency: 'HUF',
  cash_amount: 102,
  fee_status: 'known',
  fee_amount: 2,
}
const save = (b: object = body) => f.request(path, 'PUT', b)
async function read(p: string) {
  const r = await f.request(p)
  expect(r.status, await r.clone().text()).toBe(200)
  return r.json() as Promise<any>
}
async function protectedFacts() {
  return Promise.all(
    [
      'accounts',
      'transactions',
      'investment_position_anchors',
      'investment_valuations',
    ].map(
      async (t) =>
        (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all())
          .results,
    ),
  )
}
async function originalTrade() {
  return f.db
    .prepare(
      'SELECT rowid,id,account_id,type,quantity,price,total_amount,date,notes,created_at,linked_transaction_id,effective_order FROM investment_transactions WHERE id=?',
    )
    .bind('old-buy')
    .first()
}
it('confirms actual historical details once without changing original trade, cash, units or anchors; API/MCP/history/export agree', async () => {
  const before = await protectedFacts(),
    original = await originalTrade(),
    revision = await f.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first<number>('revision')
  const details = await read(path)
  expect(details.trade).toMatchObject({
    price: 50,
    quantity: 2,
    trade_version: 0,
    cash_amount: null,
  })
  expect((await save()).status).toBe(200)
  expect(await protectedFacts()).toEqual(before)
  expect(await originalTrade()).toEqual(original)
  const m = await read('/investment-metrics'),
    h = m.by_currency.HUF.holdings.find((x: any) => x.account_id === 'legacy')
  expect(h).toMatchObject({
    value: 120,
    remaining_basis: 102,
    net_invested: 102,
    total_gain: 18,
  })
  expect(h.native.remaining_basis).toBe(102)
  expect(h.coverage.cost).not.toContain('unknown_cash_flow')
  expect(m.trades.find((x: any) => x.id === 'old-buy')).toMatchObject({
    cash_source: 'confirmed_legacy',
    linked_transaction_id: null,
    cash_amount: 102,
    trade_version: 1,
  })
  const portfolio = await f.tool<any>('get_portfolio', { currency: 'HUF' })
  expect(
    portfolio.holdings.find(
      (x: any) => x.account_id === 'legacy' || x.id === 'legacy',
    ),
  ).toMatchObject({ remaining_basis: 102, gain_loss: 18 })
  const history = await read(
    '/investment-history?from=2026-01-02&to=2026-01-10&currency=HUF&timezone=UTC',
  )
  expect(history.summary.gain).toBe(18)
  const audit = await f.db
    .prepare("SELECT details FROM audit_log WHERE entity_id='old-buy'")
    .first<{ details: string }>()
  expect(JSON.parse(audit!.details)).toMatchObject({
    source: 'confirmed_legacy_details',
    cash_and_units_unchanged: true,
    before: { cash_amount: null },
    after: { cash_amount: 102 },
  })
  expect(
    await f.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first<number>('revision'),
  ).toBeGreaterThan(revision!)
  const exported = await read('/export')
  expect(
    exported.data.investment_transactions.find((t: any) => t.id === 'old-buy'),
  ).toMatchObject({
    quantity: 2,
    price: 50,
    total_amount: 100,
    cash_amount: 102,
    cash_currency: 'HUF',
    trade_version: 1,
    linked_transaction_id: null,
  })
  expect(
    exported.data.audit_log.some(
      (a: any) =>
        a.entity_id === 'old-buy' &&
        JSON.parse(a.details).source === 'confirmed_legacy_details',
    ),
  ).toBe(true)
  expect((await save()).status).toBe(409)
  expect(
    await f.db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id='old-buy'")
      .first<number>('n'),
  ).toBe(1)
})
it('permits a versioned correction and unknown fee breakdown without inventing a zero fee', async () => {
  expect(
    (
      await save({
        ...body,
        fee_status: 'unknown',
        fee_amount: null,
        cash_amount: 101,
      })
    ).status,
  ).toBe(200)
  expect((await read(path)).trade).toMatchObject({
    cash_amount: 101,
    fee_status: 'unknown',
    fee_amount: null,
    fee_currency: null,
  })
  expect((await save({ ...body, expected_version: 1 })).status).toBe(200)
  expect((await read(path)).trade).toMatchObject({
    cash_amount: 102,
    trade_version: 2,
  })
})
it.each([
  { cash_amount: 100.001 },
  { cash_amount: -1 },
  { cash_currency: 'BTC' },
  { fee_amount: -1 },
  { fee_amount: null },
  { cash_amount: 101 },
  { fee_status: 'unknown', fee_amount: 1 },
  { quantity: 3 },
  { price: 51 },
  { date: '2026-01-02' },
  { cash_account_id: 'cash' },
])(
  'rejects invalid or attempted financial mutations %j without changes',
  async (patch) => {
    const before = await protectedFacts(),
      original = await read(path)
    expect((await save({ ...body, ...patch })).status).toBe(400)
    expect(await protectedFacts()).toEqual(before)
    expect(await read(path)).toEqual(original)
  },
)
it.each([
  'locked',
  'archived',
  'reverse-link',
  'linked',
  'future',
  'gross-mismatch',
])('refuses %s legacy confirmation without writes', async (kind) => {
  if (kind === 'locked')
    await f.db
      .prepare("UPDATE accounts SET is_locked=1 WHERE id='legacy'")
      .run()
  if (kind === 'archived') {
    await f.db.prepare("UPDATE accounts SET balance=0 WHERE id='legacy'").run()
    await f.db
      .prepare(
        "UPDATE accounts SET archived_at=1,updated_at=2 WHERE id='legacy'",
      )
      .run()
  }
  if (kind === 'reverse-link' || kind === 'linked')
    await f.db
      .prepare(
        "INSERT INTO transactions(id,account_id,amount,date,status,linked_transaction_id) VALUES('cash-leg','cash',-100,'2026-01-03','posted','old-buy')",
      )
      .run()
  if (kind === 'linked')
    await f.db
      .prepare(
        "UPDATE investment_transactions SET linked_transaction_id='cash-leg' WHERE id='old-buy'",
      )
      .run()
  if (kind === 'future')
    await f.db
      .prepare(
        "UPDATE investment_transactions SET date='2030-01-01' WHERE id='old-buy'",
      )
      .run()
  if (kind === 'gross-mismatch')
    await f.db
      .prepare(
        "UPDATE investment_transactions SET total_amount=999 WHERE id='old-buy'",
      )
      .run()
  const before = await protectedFacts(),
    original = await originalTrade()
  const response = await save()
  expect([400, 409]).toContain(response.status)
  expect(await protectedFacts()).toEqual(before)
  expect(await originalTrade()).toEqual(original)
  expect(
    await f.db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id='old-buy'")
      .first<number>('n'),
  ).toBe(0)
})
it('allows exactly one concurrent confirmation and audit', async () => {
  const before = await protectedFacts()
  const responses = await Promise.all(Array.from({ length: 4 }, () => save()))
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1)
  expect(responses.filter((r) => r.status === 409)).toHaveLength(3)
  expect(await protectedFacts()).toEqual(before)
  expect(
    await f.db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id='old-buy'")
      .first<number>('n'),
  ).toBe(1)
})
it('rolls back details and financial revision if the atomic audit fails', async () => {
  const before = await read(path),
    revision = await f.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first()
  await f.db.exec(
    "CREATE TRIGGER fail_legacy_audit BEFORE INSERT ON audit_log WHEN NEW.entity_id='old-buy' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  )
  try {
    expect((await save()).status).toBe(500)
    expect(await read(path)).toEqual(before)
    expect(
      await f.db
        .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
        .first(),
    ).toEqual(revision)
  } finally {
    await f.db.exec('DROP TRIGGER fail_legacy_audit;')
  }
})

it('refuses a stale financial-source snapshot before adding details or an audit', async () => {
  const repo = new LegacyInvestmentDetailsRepository(f.db),
    snapshot = await repo.snapshot('old-buy')
  await f.db
    .prepare(
      "UPDATE investment_transactions SET notes='Synthetic competing edit' WHERE id='old-buy'",
    )
    .run()
  expect(
    await repo.save(snapshot, body as Parameters<typeof repo.save>[1]),
  ).toBe(false)
  expect((await read(path)).trade.cash_amount).toBeNull()
  expect(
    await f.db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id='old-buy'")
      .first<number>('n'),
  ).toBe(0)
})

it('treats a nullable legacy lock as unlocked, preserving existing account read semantics', async () => {
  await f.db
    .prepare("UPDATE accounts SET is_locked=NULL WHERE id='legacy'")
    .run()
  expect((await save()).status).toBe(200)
  expect((await read(path)).trade.cash_amount).toBe(102)
})
it('accepts a confirmed zero fee and cross-currency settlement without inferring FX or changing cash', async () => {
  const before = await protectedFacts()
  expect(
    (await save({ ...body, cash_amount: 100, fee_amount: 0 })).status,
  ).toBe(200)
  expect(
    (
      await save({
        ...body,
        expected_version: 1,
        execution_currency: 'EUR',
        cash_amount: 40400,
        fee_amount: 400,
      })
    ).status,
  ).toBe(200)
  expect((await read(path)).trade).toMatchObject({
    execution_currency: 'EUR',
    cash_currency: 'HUF',
    cash_amount: 40400,
    fee_amount: 400,
    fee_currency: 'HUF',
  })
  expect(await protectedFacts()).toEqual(before)
  expect(
    (
      await save({
        ...body,
        expected_version: 2,
        execution_currency: 'EUR',
        cash_amount: 400,
        fee_amount: 400,
      })
    ).status,
  ).toBe(400)
})
it('records historical sale proceeds minus a known fee without adding cash or changing its original direction', async () => {
  await f.db
    .prepare(
      "UPDATE investment_transactions SET type='sell' WHERE id='old-buy'",
    )
    .run()
  const before = await protectedFacts(),
    original = await originalTrade()
  expect((await save({ ...body, cash_amount: 98 })).status).toBe(200)
  expect((await read(path)).trade).toMatchObject({
    type: 'sell',
    cash_amount: 98,
    fee_amount: 2,
  })
  expect(await protectedFacts()).toEqual(before)
  expect(await originalTrade()).toEqual(original)
  const h = (await read('/investment-metrics')).by_currency.HUF.holdings.find(
    (a: any) => a.account_id === 'legacy',
  )
  expect(h.coverage.cost).toContain('unknown_opening')
  expect(h.total_gain).toBeNull()
})
