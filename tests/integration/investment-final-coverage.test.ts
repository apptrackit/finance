import { beforeEach, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { useFinanceWorkers } from './harness'
import { yahooFixture } from '../fixtures/market-data'
import type { InvestmentMetricsSnapshot } from '../../shared/investment-metrics'
import type { PortfolioHistoryResponse } from '../../shared/investment-history-contract'
const f = useFinanceWorkers()
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
let yahooRequests = 0,
  active = 0,
  maximum = 0
beforeEach(async () => {
  await f.seed()
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
      return Response.json(
        yahooFixture(Date.now(), decodeURIComponent(new URL(url).pathname.split('/').at(-1)!), 'HUF'),
      )
    } finally {
      active--
    }
  })
})
async function holding(id: string, symbol: string, opening = day(-7)) {
  await f.db.batch([
    f.db
      .prepare(
        "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,symbol,updated_at) VALUES(?,?,'investment',2,'SHARE','HUF','stock','market','SHARE',?,1)",
      )
      .bind(id, id, symbol),
    f.db
      .prepare(
        "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,cost_amount,cost_currency,created_at) VALUES(?,?,'opening',?,2,100,'HUF',1)",
      )
      .bind('open:' + id, id, opening),
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
  const portfolio = await f.tool<{ holdings: { remaining_basis: number | null; value: number }[] }>(
    'get_portfolio',
    { currency: 'HUF' },
  )
  expect(portfolio.holdings[0]).toMatchObject({ value: 220, remaining_basis: null })
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
    f.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first<number>('revision')
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
    await f.db.prepare(`UPDATE investment_transactions SET ${field}=${field} WHERE id='trade'`).run()
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
