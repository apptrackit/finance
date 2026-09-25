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
})
