import { describe, expect, it } from 'vitest'
import { convertCurrency, sumConversions, validRates } from '../../../shared/currency'

describe('currency conversion policy', () => {
  const rates = { HUF: 1, USD: 1 / 360, EUR: 1 / 400 }
  it('adds mixed HUF/USD/EUR balances only after conversion', () => {
    const total = sumConversions([
      convertCurrency(100_000, 'HUF', 'HUF', rates),
      convertCurrency(100, 'USD', 'HUF', rates),
      convertCurrency(100, 'EUR', 'HUF', rates),
    ])
    expect(total).toEqual({ status: 'converted', value: 176_000, missingCurrencies: [] })
  })
  it.each([undefined, 0, -1, NaN, Infinity])('makes the entire total unavailable for invalid USD rate %s', rate => {
    const total = sumConversions([
      convertCurrency(100_000, 'HUF', 'HUF', rates),
      convertCurrency(100, 'USD', 'HUF', { USD: rate as number }),
    ])
    expect(total).toEqual({ status: 'missing_rate', value: null, missingCurrencies: ['USD'] })
  })
  it('converts through the named base and identifies either missing leg', () => {
    expect(convertCurrency(100, 'EUR', 'HUF', { EUR: 0.9, HUF: 360 }, 'USD').value).toBe(40_000)
    expect(convertCurrency(100, 'EUR', 'HUF', { EUR: 0.9 }, 'USD').missingCurrencies).toEqual(['HUF'])
    expect(convertCurrency(100, 'EUR', 'HUF', { HUF: 360 }, 'USD').missingCurrencies).toEqual(['EUR'])
    expect(convertCurrency(100, 'HUF', 'HUF', {}).value).toBe(100)
  })
  it('sanitizes bad individual rates without discarding valid ones', () => {
    expect(validRates({ HUF: 1, USD: 0, EUR: -1, GBP: '1', CHF: Infinity, CAD: 2 })).toEqual({ HUF: 1, CAD: 2 })
    expect(validRates([])).toEqual({})
  })
})
