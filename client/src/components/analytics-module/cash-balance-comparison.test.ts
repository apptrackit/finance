import { describe, expect, it } from 'vitest'
import { buildCashBalanceMonthComparison, buildCashBalanceYearComparison, comparisonDelta } from './cash-balance-comparison'
import type { Account, Transaction } from './types'

const accounts: Account[] = [{ id: 'cash', name: 'Cash', type: 'cash', currency: 'HUF', balance: 1200 }]
const transaction = (date: string, amount: number, overrides: Partial<Transaction> = {}): Transaction => ({
  id: date, account_id: 'cash', status: 'posted', date, amount, ...overrides,
})
const defaults = {
  accounts, masterCurrency: 'HUF', exchangeRates: {}, selectedMonth: '2026-10-01', today: '2026-10-13',
  transactions: [transaction('2026-09-01', 500), transaction('2026-09-15', -200), transaction('2026-10-02', -100)],
}

describe('monthly cash balance comparison', () => {
  it('reconstructs daily closing balances, including opening balances and quiet days, and stops at local today', () => {
    const result = buildCashBalanceMonthComparison(defaults)
    expect(result.unavailableReason).toBeNull()
    expect(result.points).toHaveLength(31)
    expect(result.points[0]).toEqual({ day: 1, selectedDate: '2026-10-01', previousDate: '2026-09-01', selected: 1300, previous: 1500 })
    expect(result.points[1]).toMatchObject({ selected: 1200, previous: 1500 })
    expect(result.points[12]).toMatchObject({ selected: 1200, previous: 1500 })
    expect(result.points[13]).toMatchObject({ selected: null, previous: 1500 })
    expect(result.points[14]).toMatchObject({ selected: null, previous: 1300 })
    expect(result.points[30]).toMatchObject({ selected: null, previous: null, previousDate: null })
  })

  it('undoes movements after a historical selected month without changing its closing balances', () => {
    const result = buildCashBalanceMonthComparison({ ...defaults, selectedMonth: '2026-09-01', transactions: [transaction('2026-08-01', 100), ...defaults.transactions] })
    expect(result.points[0]).toMatchObject({ selected: 1500, previous: 1000 })
    expect(result.points[29]).toMatchObject({ selected: 1300, previous: 1000 })
    expect(result.points[30]).toMatchObject({ selected: null, selectedDate: null, previous: 1000 })
  })

  it('compares quiet months when earlier ledger history covers them', () => {
    const result = buildCashBalanceMonthComparison({ ...defaults, transactions: [transaction('2026-07-01', 100)] })
    expect(result.unavailableReason).toBeNull()
    expect(result.points[0]).toMatchObject({ selected: 1200, previous: 1200 })
    expect(result.points[12]).toMatchObject({ selected: 1200, previous: 1200 })
  })

  it('requires history through the first day of the previous month and does not manufacture pre-ledger coverage', () => {
    for (const transactions of [[], [transaction('2026-10-01', 100)], [transaction('2026-09-02', 100)]]) {
      const result = buildCashBalanceMonthComparison({ ...defaults, transactions })
      expect(result.unavailableReason).toContain('full previous month')
      expect(result.points).toEqual([])
    }
    expect(buildCashBalanceMonthComparison({ ...defaults, selectedMonth: '2026-11-01' }).unavailableReason).toContain('current and past')
  })

  it('does not let cancelled, upcoming, review or future rows affect balances or coverage', () => {
    const ignored = [
      transaction('2026-08-01', 9000, { status: 'cancelled' }),
      transaction('2026-09-02', 9000, { status: 'pending', pending_kind: 'upcoming' }),
      transaction('2026-10-03', 9000, { status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp' }),
      transaction('2026-10-20', 9000),
    ]
    expect(buildCashBalanceMonthComparison({ ...defaults, transactions: [...defaults.transactions, ...ignored] })).toEqual(buildCashBalanceMonthComparison(defaults))
    expect(buildCashBalanceMonthComparison({ ...defaults, transactions: ignored }).unavailableReason).toContain('history')
  })

  it('includes legacy posted rows without a status', () => {
    const transactions = defaults.transactions.map(item => ({ ...item, status: undefined }))
    expect(buildCashBalanceMonthComparison({ ...defaults, transactions })).toEqual(buildCashBalanceMonthComparison(defaults))
  })

  it('retains transfer balance effects, cash exclusions independent of net worth, and archived history', () => {
    const result = buildCashBalanceMonthComparison({ ...defaults,
      accounts: [
        { ...accounts[0], balance: 900, exclude_from_net_worth: true },
        { id: 'archived', name: 'Old cash', type: 'cash', currency: 'HUF', balance: 0, archived_at: 1 },
        { id: 'excluded', name: 'Excluded', type: 'cash', currency: 'EUR', balance: 10000, exclude_from_cash_balance: true },
        { id: 'investment', name: 'Investment', type: 'investment', currency: 'USD', balance: 1000 },
      ],
      transactions: [
        transaction('2026-09-01', 500, { account_id: 'archived' }),
        transaction('2026-10-02', -200, { account_id: 'archived', linked_transaction_id: 'credit' }),
        transaction('2026-10-02', 200, { id: 'credit', linked_transaction_id: 'debit' }),
        transaction('2026-10-03', -100, { linked_transaction_id: 'excluded-credit' }),
        transaction('2026-10-03', 100, { account_id: 'excluded', linked_transaction_id: 'cash-debit' }),
        transaction('2026-07-01', 9999, { account_id: 'investment' }),
      ],
    })
    expect(result.unavailableReason).toBeNull()
    expect(result.points[0]).toMatchObject({ selected: 1000, previous: 1000 })
    expect(result.points[1]).toMatchObject({ selected: 1000 })
    expect(result.points[2]).toMatchObject({ selected: 900 })
  })

  it('converts accounts and daily movements consistently and withholds invalid FX', () => {
    const foreign = { ...defaults, accounts: [{ ...accounts[0], currency: 'EUR', balance: 3 }], transactions: [transaction('2026-09-01', 1), transaction('2026-10-02', -0.5)] }
    const result = buildCashBalanceMonthComparison({ ...foreign, exchangeRates: { HUF: 1, EUR: 1 / 400 } })
    expect(result.points[0]).toMatchObject({ selected: 1400, previous: 1400 })
    expect(result.points[1]).toMatchObject({ selected: 1200 })
    for (const rate of [undefined, 0, -1, NaN, Infinity]) {
      expect(buildCashBalanceMonthComparison({ ...foreign, exchangeRates: rate === undefined ? {} : { EUR: rate } }).unavailableReason).toContain('exchange rates')
    }
  })

  it.each([['2024-03-01', 29], ['2025-03-01', 28]])('does not extend February for %s and picks the latest genuinely shared day', (selectedMonth, days) => {
    const result = buildCashBalanceMonthComparison({ ...defaults, selectedMonth, today: '2026-10-13', transactions: [transaction('2024-01-01', 100)] })
    expect(result.points[days - 1].previous).toBe(1200)
    expect(result.points[days].previous).toBeNull()
    expect(result.points[days].previousDate).toBeNull()
    expect(result.points.filter(point => comparisonDelta(point.selected, point.previous) !== null).at(-1)?.day).toBe(days)
  })

  it('aligns January to the preceding December across the year boundary', () => {
    const result = buildCashBalanceMonthComparison({ ...defaults, selectedMonth: '2026-01-01', transactions: [transaction('2025-12-01', 100)] })
    expect(result.previousStart).toBe('2025-12-01')
    expect(result.points[30]).toMatchObject({ selectedDate: '2026-01-31', previousDate: '2025-12-31' })
  })

  it('only computes differences for shared balances and percentages for positive denominators', () => {
    expect(comparisonDelta(null, 100)).toBeNull()
    expect(comparisonDelta(100, null)).toBeNull()
    expect(comparisonDelta(100, 0)).toEqual({ amount: 100, percentage: null })
    expect(comparisonDelta(-50, -100)).toEqual({ amount: 50, percentage: null })
    expect(comparisonDelta(75, 100)).toEqual({ amount: -25, percentage: -25 })
  })
})

describe('yearly cash balance comparison', () => {
  const yearly = (overrides: Partial<Parameters<typeof buildCashBalanceYearComparison>[0]> = {}) => buildCashBalanceYearComparison({
    accounts, masterCurrency: 'HUF', exchangeRates: {}, selectedYear: '2026-01-01', today: '2026-10-13',
    transactions: [transaction('2025-01-01', 500), transaction('2025-06-10', -200), transaction('2026-03-01', 400)], ...overrides,
  })

  it('aligns days by month and day across years and stops at local today', () => {
    const result = yearly()
    expect(result).toMatchObject({ unit: 'year', selectedStart: '2026-01-01', previousStart: '2025-01-01', unavailableReason: null })
    expect(result.points).toHaveLength(365)
    expect(result.points[0]).toEqual({ day: 1, selectedDate: '2026-01-01', previousDate: '2025-01-01', selected: 800, previous: 1000 })
    expect(result.points[59]).toMatchObject({ selectedDate: '2026-03-01', previousDate: '2025-03-01', selected: 1200, previous: 1000 })
    expect(result.points.find(point => point.previousDate === '2025-06-10')).toMatchObject({ selectedDate: '2026-06-10', selected: 1200, previous: 800 })
    expect(result.points.find(point => point.selectedDate === '2026-10-14')).toMatchObject({ selected: null, previous: 800 })
  })

  it('keeps a Feb 29 slot with no counterpart in the other year', () => {
    const result = yearly({ selectedYear: '2025-01-01', transactions: [transaction('2024-01-01', 100)] })
    expect(result.points).toHaveLength(366)
    expect(result.points[59]).toMatchObject({ selectedDate: null, previousDate: '2024-02-29', selected: null, previous: 1200 })
    expect(result.points[60]).toMatchObject({ selectedDate: '2025-03-01', previousDate: '2024-03-01' })
  })

  it('requires history from the first day of the previous year', () => {
    expect(yearly({ transactions: [transaction('2025-01-02', 100)] }).unavailableReason).toBe('Not enough cash history to cover the full previous year.')
    expect(yearly({ selectedYear: '2027-01-01' }).unavailableReason).toBe('Comparison is available for current and past years only.')
  })
})
