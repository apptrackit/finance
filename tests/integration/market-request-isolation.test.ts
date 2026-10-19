import { beforeEach, expect, it, vi } from 'vitest'
import { EXPORT_TABLES } from '../../shared/data-export'
import { yahooFixture } from '../fixtures/market-data'
import { useFinanceWorkers } from './harness'
const f = useFinanceWorkers()
const now = Date.now(),
  today = new Date(now).toISOString().slice(0, 10)
const from = new Date(now - 7 * 86400000).toISOString().slice(0, 10)
let calls = 0,
  failFx = false
beforeEach(async () => {
  await f.seed()
  calls = 0
  failFx = false
  await f.db.batch(
    Array.from({ length: 6 }, (_, i) =>
      f.db
        .prepare(
          "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,symbol,asset_type) VALUES(?,?,'investment',1,'SHARE','EUR',?,'stock')",
        )
        .bind(`holding-${i}`, `Synthetic holding ${i}`, `TEST${i}`),
    ),
  )
  const base = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input)
    if (url.startsWith('https://query1.finance.yahoo.com/')) {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 60))
      return Response.json(
        yahooFixture(
          Date.now(),
          decodeURIComponent(new URL(url).pathname.split('/').at(-1)!),
        ),
      )
    }
    if (url.startsWith('https://api.frankfurter.dev/')) {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 60))
      if (failFx) return new Response('', { status: 403 })
      const q = new URL(url).searchParams,
        rows = []
      for (
        let t = Date.parse(q.get('from')!) - 86400000;
        t <= Date.parse(q.get('to')!);
        t += 86400000
      ) {
        for (const currency of q.get('quotes')!.split(','))
          rows.push({
            date: new Date(t).toISOString().slice(0, 10),
            base: 'EUR',
            quote: currency,
            rate: currency === 'HUF' ? 400 : 2,
          })
      }
      return Response.json(rows)
    }
    return base(input, options)
  })
})
async function financial() {
  return Promise.all(
    EXPORT_TABLES.map(
      async (t) =>
        (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all())
          .results,
    ),
  )
}
async function response(path: string) {
  const r = await f.request(path, 'GET', undefined, today)
  expect(r.status, `${path}: ${await r.clone().text()}`).toBe(200)
  return r.json() as Promise<any>
}
it('isolates overlapping independent Worker quote, FX, metrics/history and MCP reads without financial changes', async () => {
  const before = await financial()
  const symbols = Array.from({ length: 6 }, (_, i) => `TEST${i}`).join(',')
  const fx = `/market/fx-history?from=${from}&to=${today}&currencies=HUF,USD`
  const reads = await Promise.all([
    response(`/market/quotes?symbols=${symbols}`),
    response(`/market/quotes?symbols=${symbols}`),
    response(fx),
    response(fx),
    response('/investment-metrics?overview=1'),
    response('/investment-history?range=1m&currency=HUF&timezone=UTC'),
    f.tool<any>('get_portfolio', { currency: 'HUF' }),
  ])
  expect(reads[0].TEST0.price).toBe(110)
  expect(reads[1].TEST5.price).toBe(110)
  expect(reads[2].status).toBe('ok')
  expect(reads[3].status).toBe('ok')
  expect(reads[4].by_currency.HUF.total_value).toBe(264000)
  expect(reads[6].holdings).toHaveLength(6)
  expect(await financial()).toEqual(before)
  // A subsequent request reuses completed D1 values, not another request's Promise.
  const count = calls
  await response(`/market/quotes?symbols=${symbols}`)
  expect(calls).toBe(count)
})
it('returns explicit missing FX during provider failure while other requests and later reads finish', async () => {
  failFx = true
  const before = await financial(),
    symbols = Array.from({ length: 6 }, (_, i) => `TEST${i}`).join(',')
  const [fx, quotes, metrics] = await Promise.all([
    response(`/market/fx-history?from=${from}&to=${today}&currencies=HUF,USD`),
    response(`/market/quotes?symbols=${symbols}`),
    response('/investment-metrics?overview=1'),
  ])
  expect(fx).toMatchObject({ status: 'missing', points: [] })
  expect(quotes.TEST0.price).toBe(110)
  expect(
    metrics.by_currency.HUF.holdings.every(
      (h: any) => h.coverage.value.length === 0,
    ),
  ).toBe(true)
  expect(await financial()).toEqual(before)
  failFx = false
  expect(
    (
      await response(
        `/market/fx-history?from=${from}&to=${today}&currencies=HUF,USD`,
      )
    ).status,
  ).toBe('ok')
})
it('cancels one HTTP caller without hanging an independent overlapping Worker request', async () => {
  const token = await f.accessToken({ aud: ['finance-api-audience'] }),
    controller = new AbortController()
  const path = '/market/quotes?symbols=TEST0,TEST1,TEST2,TEST3,TEST4,TEST5'
  const cancelled = f.api
    .fetch(path, {
      headers: {
        Origin: 'https://finance.test',
        'Cf-Access-Jwt-Assertion': token,
      },
      signal: controller.signal,
    })
    .then(
      (r) => r.text(),
      (e) => e,
    )
  const healthy = response(path)
  await new Promise((resolve) => setTimeout(resolve, 20))
  controller.abort()
  expect((await healthy).TEST0.price).toBe(110)
  await cancelled
  expect((await response('/market/quote?symbol=TEST5')).price).toBe(110)
})
it('gives separate D1 read contexts independent flight scopes but preserves completed payload sharing', async () => {
  const { D1MarketCache } = await import('../../shared/market-cache')
  const one = new D1MarketCache(f.db),
    two = new D1MarketCache(f.db)
  expect(one.scope).not.toBe(two.scope)
  await one.put('synthetic:completed', { price: 123 }, Date.now(), 60000, 60000)
  expect(
    (await two.get<{ price: number }>('synthetic:completed'))?.data,
  ).toEqual({ price: 123 })
})

it('uses an older trade-date rate despite a provider prefix preceding the padded start', async () => {
  await f.db
    .prepare(
      "INSERT INTO investment_transactions(id,account_id,type,quantity,price,total_amount,date,effective_order,trade_version,execution_currency,cash_amount,cash_currency,fee_status,fee_amount,fee_currency) VALUES('legacy-buy','holding-0','buy',1,100,100,'2025-10-15',1,1,'USD',100,'USD','known',0,'USD')",
    )
    .run()
  const before = await financial(),
    m = await response('/investment-metrics?overview=1')
  const h = m.by_currency.HUF.holdings.find(
    (a: any) => a.account_id === 'holding-0',
  )
  expect(h.remaining_basis).toBe(20000)
  expect(h.coverage.cost).not.toContain('missing_dated_fx')
  const fx = await response(
    '/market/fx-history?from=2025-10-15&to=2025-10-15&currencies=HUF,USD',
  )
  expect(fx.status).toBe('ok')
  expect(fx.points.every((p: any) => p.date >= '2025-10-11')).toBe(true)
  expect(await financial()).toEqual(before)
})
