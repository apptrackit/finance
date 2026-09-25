import { describe, expect, it } from 'vitest'
import { summarizeForecastHistory, type ForecastTransaction } from './forecast-evidence'

const row = (date: string, amount: number, description: string): ForecastTransaction => ({
  date, amount, description, account_name: 'Everyday cash', category_name: amount > 0 ? 'Salary' : 'Living costs',
})

describe('historical forecast evidence', () => {
  it('surfaces repeated paychecks beyond one recorded upcoming paycheck and separates expense patterns from one-offs', () => {
    const evidence = summarizeForecastHistory([
      row('2026-05-09', 10_000, 'Example Payroll Co'),
      row('2026-06-09', 10_200, 'Example Payroll Co'),
      row('2026-07-09', 10_100, 'Example Payroll Co'),
      row('2026-08-09', 10_300, 'Example Payroll Co'),
      row('2026-09-09', 10_110, 'Example Payroll Co'),
      row('2026-08-12', -500, 'Groceries'),
      row('2026-09-12', -550, 'Groceries'),
      row('2026-09-15', -3_000, 'Moving deposit'),
    ], '2025-09-26', '2026-09-25')

    expect(evidence.recurring_income_candidates).toEqual([expect.objectContaining({
      description: 'Example Payroll Co', distinct_months: 5, occurrence_count: 5,
      last_seen_date: '2026-09-09', recent_amounts: [10_000, 10_200, 10_100, 10_300, 10_110],
    })])
    expect(evidence.income_transactions).toHaveLength(5)
    expect(evidence.recurring_expense_candidates).toEqual([expect.objectContaining({ description: 'Groceries', distinct_months: 2 })])
    expect(evidence.recurring_expense_candidates.some(source => source.description === 'Moving deposit')).toBe(false)
    expect(evidence.monthly_totals.find(month => month.month === '2026-09')).toMatchObject({ income: 10_110, expenses: 3550 })
    expect(evidence.monthly_totals.find(month => month.month === '2026-09')?.complete_month).toBe(false)
    expect(evidence.monthly_totals.find(month => month.month === '2026-04')).toMatchObject({ income: 0, expenses: 0, complete_month: true })
  })

  it('bounds named income rows while retaining monthly totals and reporting truncation', () => {
    const rows = Array.from({ length: 125 }, (_, index) => row('2026-09-09', 100 + index, `Income ${index}`))
    const evidence = summarizeForecastHistory(rows, '2025-09-26', '2026-09-25')

    expect(evidence.income_transactions).toHaveLength(120)
    expect(evidence.income_transactions_truncated).toBe(true)
    expect(evidence.monthly_totals.find(month => month.month === '2026-09')?.income_count).toBe(125)
  })
})
