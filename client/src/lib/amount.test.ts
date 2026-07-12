import { describe, expect, it } from 'vitest'
import {
  expandScientificNotation,
  formatAmount,
  formatCalculatedAmount,
  parseAmount,
} from './amount'

describe('amount formatting', () => {
  it('uses ASCII-space grouping and preserves decimal text', () => {
    expect(formatAmount('1234567.000123')).toBe('1 234 567.000123')
    expect(formatAmount('-120000.50')).toBe('-120 000.50')
    expect(formatAmount(1234.567, { maximumFractionDigits: 2 })).toBe('1 234.57')
  })

  it('normalizes pasted locale separators', () => {
    expect(formatAmount('12\u00a0345,67')).toBe('12 345.67')
    expect(formatAmount('12\u202f345,67')).toBe('12 345.67')
    expect(parseAmount('12\u00a0345,67')).toBe(12345.67)
  })

  it('strictly parses complete drafts', () => {
    expect(parseAmount('120 300')).toBe(120300)
    expect(parseAmount('-120 300')).toBe(-120300)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
    expect(parseAmount('-1', { allowNegative: false })).toBeNull()
  })

  it('expands scientific notation', () => {
    expect(expandScientificNotation(1e-8)).toBe('0.00000001')
    expect(formatAmount(1e21)).toBe('1 000 000 000 000 000 000 000')
  })

  it('bounds calculated precision and removes floating-point tails', () => {
    expect(formatCalculatedAmount(0.1 * 0.2, { maximumFractionDigits: 2 })).toBe('0.02')
    expect(formatCalculatedAmount(1000 * 365.1234, { maximumFractionDigits: 2 })).toBe('365 123.4')
    expect(formatCalculatedAmount(1e-8, { maximumFractionDigits: 8 })).toBe('0.00000001')
    expect(formatCalculatedAmount(12, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })).toBe('12.00')
  })
})
