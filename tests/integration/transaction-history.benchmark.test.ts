import { describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

// Opt-in, synthetic local Worker/D1 measurement. Never touches saved configs.
describe('history loading measurement', () => {
  const f = useFinanceWorkers()
  for (const [name, cashCount, investmentCount, currentCash, currentInvestment] of [
    ['small', 100, 50, 20, 10], ['large', 20_000, 5_000, 200, 50],
  ] as const) {
    it.skipIf(process.env.FINANCE_HISTORY_BENCHMARK !== '1')(`measures ${name} startup, refresh and on-demand history`, async () => {
      await f.seed()
      await f.db.prepare(`WITH RECURSIVE rows(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM rows WHERE n < ?)
        INSERT INTO transactions (id, account_id, amount, description, date, status, created_at, updated_at)
        SELECT printf('cash-%06d', n), 'cash', -n, 'Synthetic expense for history measurement',
          CASE WHEN n <= ? THEN '2026-01-15' ELSE '2025-12-15' END, 'posted', n, n FROM rows`).bind(cashCount, currentCash).run()
      for (let account = 0; account < 5; account++) {
        await f.db.batch([
          f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES (?, 'Synthetic holding', 'investment', 1, 'USD', 1)").bind(`holding-${account}`),
          f.db.prepare(`WITH RECURSIVE rows(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM rows WHERE n < ?)
            INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, notes, created_at)
            SELECT ? || printf('-%06d', n), ?, 'buy', 0.01234567, 100, 1.234567,
              CASE WHEN n <= ? THEN '2026-01-15' ELSE '2025-12-15' END, 'Synthetic investment for history measurement', n FROM rows`)
            .bind(investmentCount / 5, `holding-${account}`, `holding-${account}`, currentInvestment / 5),
        ])
      }
      async function measure(mode: 'before' | 'after' | 'analytics') {
        const started = performance.now()
        let bytes = 0
        let requests = 0
        let rows = 0
        async function read(path: string) {
          const response = await f.request(path)
          expect(response.status).toBe(200)
          const body = await response.text()
          bytes += Buffer.byteLength(body)
          requests++
          return JSON.parse(body)
        }
        if (mode === 'before') {
          const paths = ['/transactions', '/transactions/date-range?startDate=2026-01-01&endDate=2026-01-31',
            ...Array.from({ length: 10 }, (_, index) => `/investment-transactions?account_id=holding-${index % 5}`)]
          const responses = await Promise.all(paths.map(read))
          rows = responses.reduce((total, response) => total + response.length, 0)
        } else {
          let cursor: string | null = null
          do {
            const params = new URLSearchParams({ limit: '500' })
            if (mode === 'after') { params.set('startDate', '2026-01-01'); params.set('endDate', '2026-01-31') }
            if (cursor) params.set('cursor', cursor)
            const page = await read(`/transactions/history?${params}`)
            rows += page.transactions.length + page.investments.length
            cursor = page.nextCursor
          } while (cursor)
        }
        return { requests, bytes, rows, ms: Math.round((performance.now() - started) * 10) / 10 }
      }
      const results = []
      for (const operation of ['startup', 'refresh'] as const) {
        const before: Awaited<ReturnType<typeof measure>>[] = []
        const after: Awaited<ReturnType<typeof measure>>[] = []
        for (let run = 0; run < 3; run++) {
          before.push(await measure('before'))
          after.push(await measure('after'))
        }
        const median = (samples: typeof before) => ({ ...samples[0], ms: samples.map(sample => sample.ms).sort((a, b) => a - b)[1] })
        results.push({ fixture: name, operation, before: median(before), after: median(after) })
        expect(after[0].requests).toBe(1)
        expect(after[0].rows).toBe(currentCash + currentInvestment)
        expect(after[0].bytes).toBeLessThan(before[0].bytes)
      }
      const analytics = await measure('analytics')
      expect(analytics.rows).toBe(cashCount + investmentCount)
      process.stdout.write(JSON.stringify({ results, analytics }) + '\n')
    }, 60_000)
  }
})
