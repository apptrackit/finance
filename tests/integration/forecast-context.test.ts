import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type OutlookContext = {
  core_data: {
    historical_patterns: {
      recurring_income_candidates: Array<{ description: string; distinct_months: number; last_seen_date: string }>
      monthly_totals: Array<{ month: string; income: number }>
    }
    known_future: { pending_one_time_transactions: Array<{ description: string }> }
  }
  previous_forecasts: Array<{ assumptions: string[] }>
}

describe('MCP financial outlook context', () => {
  const f = useFinanceWorkers()
  beforeEach(() => f.seed())

  it('provides repeated salary evidence, the next upcoming paycheck, and earlier user plans together', async () => {
    const now = new Date()
    const monthDate = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 9)).toISOString().slice(0, 10)
    await f.db.prepare("INSERT INTO categories (id, name, type) VALUES ('salary', 'Salary', 'income')").run()
    for (let index = 1; index <= 4; index++) {
      await f.db.prepare("INSERT INTO transactions (id, account_id, category_id, amount, description, date, status) VALUES (?, 'cash', 'salary', ?, 'Example Payroll Co', ?, 'posted')")
        .bind(`salary-${index}`, 10_000 + index * 100, monthDate(index)).run()
    }
    await f.db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').bind(42_000, 'cash').run()
    const upcomingDate = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10)
    await f.db.prepare("INSERT INTO transactions (id, account_id, category_id, amount, description, date, status) VALUES ('next-salary', 'cash', 'salary', 10110, 'Example Payroll Co', ?, 'pending')")
      .bind(upcomingDate).run()
    const revision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id = 1').first<{ revision: number }>()
    await f.db.prepare("INSERT INTO financial_outlook_snapshots (id, idempotency_key, payload_hash, schema_version, currency, source_revision, source_queried_at, created_at, headline, data_quality_score, data_quality_label, payload, source_coverage) VALUES ('prior', 'prior-forecast-key', 'hash', 3, 'HUF', ?, ?, ?, 'Previous outlook', 80, 'high', ?, '{}')")
      .bind(revision!.revision, new Date(now.getTime() - 86_400_000).toISOString(), now.getTime() - 86_400_000, JSON.stringify({ assumptions: ['User plans to buy a laptop next month'] })).run()

    const context = await f.tool<OutlookContext>('get_financial_outlook_context', {})
    expect(context.core_data.historical_patterns.recurring_income_candidates).toEqual([expect.objectContaining({ description: 'Example Payroll Co', distinct_months: 4, last_seen_date: monthDate(1) })])
    expect(context.core_data.historical_patterns.monthly_totals.filter(month => month.income > 0)).toHaveLength(4)
    expect(context.core_data.known_future.pending_one_time_transactions).toEqual([expect.objectContaining({ description: 'Example Payroll Co' })])
    expect(context.previous_forecasts[0].assumptions).toContain('User plans to buy a laptop next month')
  })

  it('stores generation-anchored year and all-time cash history for a new forecast', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const monthsAgo = (months: number) => {
      const date = new Date(`${today}T00:00:00Z`)
      date.setUTCDate(15)
      date.setUTCMonth(date.getUTCMonth() - months)
      return date.toISOString().slice(0, 10)
    }
    const oldDate = monthsAgo(18)
    const recentDate = monthsAgo(6)
    await f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, exclude_from_cash_balance) VALUES ('excluded', 'Excluded cash', 'checking', 50, 'HUF', 1)").run()
    await f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status) VALUES ('excluded-older', 'excluded', 50, ?, 'posted')").bind(monthsAgo(24)).run()
    await f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status) VALUES ('old-income', 'cash', 100, ?, 'posted')").bind(oldDate).run()
    await f.db.prepare("INSERT INTO transactions (id, account_id, amount, date, status) VALUES ('recent-expense', 'cash', -20, ?, 'posted')").bind(recentDate).run()
    await f.db.prepare("UPDATE accounts SET balance = 1080 WHERE id = 'cash'").run()
    const context = await f.tool<{ source_revision: number; as_of: string }>('get_financial_outlook_context', {})
    let expected = 1280
    const path = Array.from({ length: 91 }, (_, day) => {
      if (day > 0) expected -= day % 2 === 0 ? 2 : 1
      return { day, low: day === 0 ? expected : expected - 10, expected, high: day === 0 ? expected : expected + 10 }
    })
    const published = await f.tool<{ snapshot: { id: string; schema_version: number; cash_balance_history_year: Array<{ date: string; balance: number }>; cash_balance_history_alltime: Array<{ date: string; balance: number }> } }>('create_financial_outlook_snapshot', {
      idempotency_key: 'forecast-history-integration',
      source_revision: context.source_revision,
      source_queried_at: context.as_of,
      headline: 'Cash remains stable.',
      horizons: [7, 30, 90].map(days => ({ days, cash_balance: { low: path[days].low, expected: path[days].expected, high: path[days].high } })),
      cash_balance_path: path,
    })
    expect(published.snapshot.schema_version).toBe(4)
    expect(published.snapshot.cash_balance_history_year[0].date).toBe(new Date(Date.UTC(Number(today.slice(0, 4)) - 1, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))).toISOString().slice(0, 10))
    expect(published.snapshot.cash_balance_history_year.at(-1)).toEqual({ date: today, balance: 1280 })
    expect(published.snapshot.cash_balance_history_alltime[0].date).toBe(oldDate)
    expect(published.snapshot.cash_balance_history_alltime.at(-1)).toEqual({ date: today, balance: 1280 })
    await f.db.prepare("UPDATE accounts SET balance = 900 WHERE id = 'cash'").run()
    const response = await f.request('/financial-outlook/latest')
    expect(response.status).toBe(200)
    const latest = await response.json() as { snapshot: typeof published.snapshot }
    expect(latest.snapshot.cash_balance_history_alltime).toEqual(published.snapshot.cash_balance_history_alltime)
  })
})
