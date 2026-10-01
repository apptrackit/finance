import { describe, expect, it } from 'vitest'
import { periodEndDates, recurringDates } from './date-series'
import type { RecurringScheduleRow } from './types'

function schedule(overrides: Partial<RecurringScheduleRow>): RecurringScheduleRow {
  return {
    id: 'schedule', type: 'transaction', frequency: 'monthly', day_of_month: 31,
    account_id: 'cash', amount: -1, is_active: 1, created_at: Date.UTC(2026, 0, 1),
    ...overrides,
  }
}

describe('bounded finance date series', () => {
  it('uses the selected yearly month, including January, instead of the creation month', () => {
    for (const [month, date] of [[0, '2027-01-31'], [6, '2026-07-31']] as const) {
      expect(recurringDates(schedule({ frequency: 'yearly', created_at: Date.UTC(2026, 2, 1), month }),
        '2026-03-01', '2027-02-01', 10)).toEqual([date])
    }
  })

  it('keeps the creation month for legacy yearly schedules with a null or absent month', () => {
    for (const month of [null, undefined]) {
      expect(recurringDates(schedule({ frequency: 'yearly', created_at: Date.UTC(2026, 2, 1), month }),
        '2026-03-01', '2026-12-31', 10)).toEqual(['2026-03-31'])
    }
  })

  it('clamps yearly dates and respects processed dates, end dates and occurrence limits', () => {
    const yearly = schedule({ frequency: 'yearly', month: 1, created_at: Date.UTC(2025, 2, 1) })
    expect(recurringDates(yearly, '2025-01-01', '2028-12-31', 10))
      .toEqual(['2026-02-28', '2027-02-28', '2028-02-29'])
    expect(recurringDates({ ...yearly, last_processed_date: '2026-02-28', remaining_occurrences: 1 },
      '2025-01-01', '2028-12-31', 10)).toEqual(['2027-02-28'])
    expect(recurringDates({ ...yearly, end_date: '2026-02-27' }, '2025-01-01', '2028-12-31', 10)).toEqual([])
    expect(recurringDates({ ...yearly, remaining_occurrences: 0 }, '2025-01-01', '2028-12-31', 10)).toEqual([])
  })

  it('uses the last calendar day for monthly schedules whose requested day does not exist', () => {
    expect(recurringDates(schedule({}), '2026-02-01', '2026-03-31', 10)).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('does not forecast already processed or pre-creation occurrences', () => {
    expect(recurringDates(schedule({ created_at: Date.UTC(2026, 1, 15), last_processed_date: '2026-02-28' }), '2026-01-01', '2026-03-31', 10)).toEqual(['2026-03-31'])
  })

  it('bounds chart output and asks callers to use a wider interval', () => {
    expect(() => periodEndDates('2020-01-01', '2022-01-01', 'day', 400)).toThrow('more than 400 chart points')
  })
})
