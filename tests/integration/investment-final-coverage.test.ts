import { beforeEach, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { useFinanceWorkers } from './harness'
import { yahooFixture } from '../fixtures/market-data'
import type { InvestmentMetricsSnapshot } from '../../shared/investment-metrics'
import type { PortfolioHistoryResponse } from '../../shared/investment-history-contract'
const f = useFinanceWorkers()
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
let sourceEvent: 'dividend' | 'split' | null = null
let yahooRequests = 0,
  active = 0,
  maximum = 0
beforeEach(async () => {
  await f.seed()
  sourceEvent = null
  yahooRequests = 0
  active = 0
  maximum = 0
  const base = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input)
    if (!url.startsWith('https://query1.finance.yahoo.com/')) return base(input, options)
    yahooRequests++
    active++
    maximum = Math.max(maximum, active)
    try {
      await new Promise((r) => setTimeout(r, 2))
      const payload = yahooFixture(
        Date.now(),
        decodeURIComponent(new URL(url).pathname.split('/').at(-1)!),
        'HUF',
      )
      if (sourceEvent) {
        const date = Math.floor(Date.parse(day(-1)) / 1000)
        payload.chart.result[0].events =
          sourceEvent === 'dividend'
            ? { dividends: { [date]: { date, amount: 0.01 } } }
            : { splits: { [date]: { date, numerator: 2, denominator: 1 } } }
      }
      return Response.json(payload)
    } finally {
      active--
    }
  })
})
async function holding(id: string, symbol: string, opening = day(-7), balance = 2) {
  await f.db.batch([
    f.db
      .prepare(
        "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,symbol,updated_at) VALUES(?,?,'investment',?,'SHARE','HUF','stock','market','SHARE',?,1)",
      )
      .bind(id, id, balance, symbol),
    f.db
      .prepare(
        "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,cost_amount,cost_currency,created_at) VALUES(?,?,'opening',?,?,?,'HUF',1)",
      )
      .bind('open:' + id, id, opening, balance, balance ? 100 : 0),
  ])
}
it('agrees on unavailable old-opening cost across API/MCP and history despite a matching current quantity', async () => {
  await holding('old', 'OLD', '2000-01-01')
  const response = await f.request('/investment-metrics?overview=1', 'GET', undefined, day())
  expect(response.status, await response.clone().text()).toBe(200)
  const data = (await response.json()) as InvestmentMetricsSnapshot
  expect(data.by_currency.HUF.holdings[0]).toMatchObject({
    quantity: 2,
    value: 220,
    remaining_basis: null,
    total_gain: null,
    native: { remaining_basis: null },
  })
  expect(data.by_currency.HUF.holdings[0].coverage.cost).toContain('unverified_corporate_actions')
  const portfolio = await f.tool<{
    holdings: { remaining_basis: number | null; value: number }[]
  }>('get_portfolio', { currency: 'HUF' })
  expect(portfolio.holdings[0]).toMatchObject({
    value: 220,
    remaining_basis: null,
  })
  const h = await f.request(
    `/investment-history?from=${day(-1)}&to=${day()}&currency=HUF&timezone=UTC`,
    'GET',
    undefined,
    day(),
  )
  expect(h.status, await h.clone().text()).toBe(200)
  const series = (await h.json()) as PortfolioHistoryResponse
  expect(series.points[0].value).toBeNull()
  expect(series.points.at(-1)?.value).toBe(220)
  expect(series.summary.estimated_return_percent).toBeNull()
  expect(series.summary.reasons).toContain('unsupported_event')
})
it('bounds real Worker provider fan-out by distinct symbols and reuses the shared cache across overview/history/MCP', async () => {
  for (let i = 0; i < 50; i++) await holding('holding:' + i, 'SYMBOL' + (i % 10))
  const begin = performance.now()
  const first = await f.request('/investment-metrics?overview=1', 'GET', undefined, day())
  expect(first.status, await first.clone().text()).toBe(200)
  const data = (await first.json()) as InvestmentMetricsSnapshot
  expect(data.accounts).toHaveLength(50)
  expect(Object.values(data.overview!.trends).every((t) => t.points.length === 30)).toBe(true)
  expect(yahooRequests).toBe(10)
  expect(maximum).toBeLessThanOrEqual(4)
  const history = await f.request(
    `/investment-history?range=1m&currency=HUF&timezone=UTC&expected_revision=${data.source_revision}`,
    'GET',
    undefined,
    day(),
  )
  expect(history.status, await history.clone().text()).toBe(200)
  await f.tool('get_portfolio', { currency: 'HUF' })
  expect(yahooRequests).toBe(10)
  expect(
    (
      (await (
        await f.request('/investment-metrics?overview=1', 'GET', undefined, day())
      ).json()) as InvestmentMetricsSnapshot
    ).source_revision,
  ).toBe(data.source_revision)
  expect(yahooRequests).toBe(10)
  process.stdout.write(
    JSON.stringify({
      fixture: '50 holdings / 10 distinct symbols',
      provider_requests: yahooRequests,
      provider_concurrency: maximum,
      overview_history_mcp_ms: Math.round(performance.now() - begin),
    }) + '\n',
  )
})
it('invalidates the financial revision for every trade financial field while link-only repair stays metadata', async () => {
  await holding('holding', 'TEST')
  await f.db
    .prepare(
      "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,effective_order) VALUES('trade','holding','buy',1,10,10,?,1)",
    )
    .bind(day(-1))
    .run()
  const revision = () =>
    f.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first<number>('revision')
  const fields = [
    'created_at',
    'account_id',
    'type',
    'quantity',
    'price',
    'total_amount',
    'date',
    'notes',
    'execution_currency',
    'gross_amount',
    'fee_amount',
    'fee_currency',
    'fee_status',
    'cash_amount',
    'cash_currency',
    'effective_order',
    'trade_version',
    'asset_event',
  ]
  for (const field of fields) {
    const before = await revision()
    await f.db
      .prepare(`UPDATE investment_transactions SET ${field}=${field} WHERE id='trade'`)
      .run()
    expect(await revision(), field).toBe(before! + 1)
  }
  const before = await revision()
  await f.db
    .prepare(
      "UPDATE investment_transactions SET linked_transaction_id=linked_transaction_id WHERE id='trade'",
    )
    .run()
  expect(await revision()).toBe(before)
})

it.each(['dividend', 'split'] as const)(
  'keeps API/MCP %s policy consistent without posting source events',
  async (type) => {
    sourceEvent = type
    await holding('holding', 'TEST', day(-3), 0)
    const buy = await f.request(
      '/investment-trades',
      'POST',
      {
        idempotency_key: crypto.randomUUID(),
        holding_account_id: 'holding',
        cash_account_id: 'cash',
        type: 'buy',
        quantity: 2,
        price: 100,
        execution_currency: 'HUF',
        cash_amount: 200,
        fee_status: 'known',
        fee_amount: 0,
        date: day(-2),
      },
      day(),
    )
    expect(buy.status, await buy.clone().text()).toBe(201)
    const facts = () =>
      Promise.all(
        [
          'accounts',
          'transactions',
          'investment_transactions',
          'investment_position_anchors',
          'investment_valuations',
          'financial_data_revision',
          'audit_log',
          'investment_trade_operations',
        ].map(
          async (t) =>
            (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all()).results,
        ),
      )
    const before = await facts()
    const response = await f.request(
      '/investment-metrics?currencies=HUF&overview=1',
      'GET',
      undefined,
      day(),
    )
    expect(response.status, await response.clone().text()).toBe(200)
    const metrics = (await response.json()) as InvestmentMetricsSnapshot
    const portfolio = await f.tool<{
      holdings: {
        remaining_basis: number | null
        gain_loss: number | null
        coverage: { cost: string[] }
      }[]
      gain_loss_coverage: { dividends: string }
    }>('get_portfolio', { currency: 'HUF' })
    const r = await f.request(
      `/investment-history?from=${day(-1)}&to=${day()}&currency=HUF&timezone=UTC`,
      'GET',
      undefined,
      day(),
    )
    expect(r.status, await r.clone().text()).toBe(200)
    const history = (await r.json()) as PortfolioHistoryResponse
    const h = metrics.by_currency.HUF.holdings[0]
    if (type === 'dividend') {
      expect(h).toMatchObject({
        quantity: 2,
        remaining_basis: 200,
        net_invested: 200,
        total_gain: 20,
      })
      expect(h.coverage.cost).toEqual([])
      expect(portfolio.holdings[0]).toMatchObject({
        remaining_basis: 200,
        gain_loss: 20,
        coverage: { cost: [] },
      })
      expect(history.summary.status).toBe('complete')
      expect(history.summary.gain).not.toBeNull()
      expect(metrics.by_currency.HUF.market_today.covered_holdings).toBe(1)
    } else {
      expect(h.coverage.cost).toContain('unsupported_event')
      expect(h.remaining_basis).toBeNull()
      expect(portfolio.holdings[0].coverage.cost).toContain('unsupported_event')
      expect(history.summary.reasons).toContain('unsupported_event')
      expect(history.summary.gain).toBeNull()
    }
    expect(portfolio.gain_loss_coverage.dividends).toBe('excluded')
    expect(history.method.flow_timing).toContain('Excludes dividends')
    expect(await facts()).toEqual(before)
  },
)
