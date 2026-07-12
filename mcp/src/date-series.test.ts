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
