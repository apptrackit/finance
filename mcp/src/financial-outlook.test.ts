import { describe, expect, it } from 'vitest'
import { parseFinancialOutlookInput } from './financial-outlook'

const validInput = {
  idempotency_key: 'forecast-run-2026-08-26',
  source_revision: 12,
  source_queried_at: '2026-08-26T12:00:00.000Z',
  headline: 'Cash remains stable while scheduled spending increases.',
  horizons: [7, 30, 90].map(days => ({
    days,
    cash_balance: { low: 800, expected: 1_000, high: 1_200 },
  })),
  cash_balance_path: Array.from({ length: 91 }, (_, day) => ({
    day,
    ...(day === 7 || day === 30 || day === 90
      ? { low: 800, expected: 1_000, high: 1_200 }
      : { low: 950, expected: 1_000, high: 1_050 }),
  })),
  drivers: ['Known recurring income'],
  risks: ['Unusual discretionary spending'],
  assumptions: ['No large unrecorded expenses'],
  suggestions: ['Watch the discretionary-spending category'],
}

describe('financial outlook snapshot validation', () => {
  it('normalizes a complete structured forecast with all required horizons', () => {
    const result = parseFinancialOutlookInput(validInput)
    expect(result.horizons.map(horizon => horizon.days)).toEqual([7, 30, 90])
    expect(result.horizons[0].cash_balance).toEqual({ low: 800, expected: 1_000, high: 1_200 })
  })

  it('rejects missing horizons and invalid scenario order', () => {
    expect(() => parseFinancialOutlookInput({ ...validInput, horizons: validInput.horizons.slice(0, 2) })).toThrow('exactly')
    const invalid = structuredClone(validInput)
    invalid.horizons[0].cash_balance = { low: 1_200, expected: 1_000, high: 800 }
    expect(() => parseFinancialOutlookInput(invalid)).toThrow('low <= expected <= high')
  })

  it('requires a complete daily AI cash path that agrees with each horizon', () => {
    expect(() => parseFinancialOutlookInput({ ...validInput, cash_balance_path: validInput.cash_balance_path.slice(0, 90) })).toThrow('every day')
    const mismatched = structuredClone(validInput)
    mismatched.cash_balance_path.find(point => point.day === 7)!.expected = 1_001
    expect(() => parseFinancialOutlookInput(mismatched)).toThrow('exact 7-day')

    const outOfOrder = structuredClone(validInput)
    outOfOrder.cash_balance_path[8].day = 9
    expect(() => parseFinancialOutlookInput(outOfOrder)).toThrow('each whole day')
  })

  it('rejects invalid revisions, timestamps, and oversized narrative text', () => {
    expect(() => parseFinancialOutlookInput({ ...validInput, source_revision: -1 })).toThrow('source_revision')
    expect(() => parseFinancialOutlookInput({ ...validInput, source_queried_at: 'not-a-date' })).toThrow('ISO timestamp')
    expect(() => parseFinancialOutlookInput({ ...validInput, headline: 'x'.repeat(241) })).toThrow('at most 240')
  })
})
