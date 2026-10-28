import { describe, expect, it } from 'vitest'
import { clipBalancesToPeriod } from './cash-balance-trend'

const balances = [
  { date: '2026-09-20', balance: 1000 },
  { date: '2026-10-05', balance: 1500 },
  { date: '2026-10-27', balance: 1400 },
]

describe('cash balance period clipping', () => {
  it('opens a month on the 1st with the carried balance and fills quiet days through today', () => {
    const month = clipBalancesToPeriod(balances, { start: '2026-10-01', end: '2026-10-31', daily: true })
    expect(month).toHaveLength(27)
    expect(month[0]).toEqual({ date: '2026-10-01', balance: 1000 })
    expect(month[3]).toEqual({ date: '2026-10-04', balance: 1000 })
    expect(month[4]).toEqual({ date: '2026-10-05', balance: 1500 })
    expect(month.at(-1)).toEqual({ date: '2026-10-27', balance: 1400 })
  })

  it('carries a finished period to its last day and pads a year without filling every day', () => {
    expect(clipBalancesToPeriod(balances, { start: '2026-09-01', end: '2026-09-30' })).toEqual([
      { date: '2026-09-20', balance: 1000 }, { date: '2026-09-30', balance: 1000 },
    ])
    expect(clipBalancesToPeriod([{ date: '2025-12-30', balance: 50 }, ...balances], { start: '2026-01-01', end: '2026-12-31' })).toEqual([
      { date: '2026-01-01', balance: 50 }, ...balances,
    ])
  })

  it('does not invent a balance before the first record', () => {
    expect(clipBalancesToPeriod(balances, { start: '2026-09-01', end: '2026-09-30', daily: true })[0]).toEqual({ date: '2026-09-20', balance: 1000 })
    expect(clipBalancesToPeriod([], { start: '2026-10-01', end: '2026-10-31', daily: true })).toEqual([])
  })
})
