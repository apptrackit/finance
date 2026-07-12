import { describe, expect, it } from 'vitest'
import { assertDate, assertDateRange, clampLimit, decodeCursor, defaultMonthRange, encodeCursor, previousRange } from './validation'

describe('finance MCP validation', () => {
  it('validates real ISO dates', () => {
    expect(assertDate('2026-07-11', 'date')).toBe('2026-07-11')
    expect(() => assertDate('2026-02-30', 'date')).toThrow('valid calendar date')
  })

  it('bounds date ranges and pagination', () => {
    expect(assertDateRange('2026-01-01', '2026-01-31')).toBe(31)
    expect(() => assertDateRange('2026-02-01', '2026-01-01')).toThrow()
    expect(clampLimit(1000)).toBe(100)
    const cursor = encodeCursor(50)
    expect(decodeCursor(cursor)).toBe(50)
  })

  it('computes previous equivalent periods', () => {
    expect(previousRange('2026-07-01', '2026-07-31')).toEqual({ startDate: '2026-05-31', endDate: '2026-06-30' })
    expect(defaultMonthRange(new Date('2026-07-11T00:00:00Z'))).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' })
  })
})
