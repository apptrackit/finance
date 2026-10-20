import { describe, expect, it } from 'vitest'
import { holdingNativeValue, positionFromObservation, validHoldingNumber, validLocalDate } from '../../../shared/holding'
import type { PositionAnchor } from '../../../shared/holding'
const anchor: PositionAnchor = { id: 'synthetic-opening', kind: 'opening', effective_date: '2026-01-01', balance: 3,
  cost_amount: 30, cost_currency: 'EUR', trade_rowid_boundary: 0, created_at: 1 }
const etf = { type: 'investment', balance: 5, currency: 'SHARE', quote_currency: 'EUR', asset_type: 'etf' }
describe('shared holding read model', () => {
  it('preserves stored units and flags incomplete history instead of inventing a buy', () => {
    expect(positionFromObservation(etf, 2, 0, { ...anchor, kind: 'observed', cost_amount: null }))
      .toMatchObject({ quantity: 5, activity_quantity: 2, residual: 3, history_status: 'mismatch', coverage_reasons: ['unknown_opening', 'quantity_mismatch', 'unknown_cost'] })
  })
  it('replays a confirmed EOD opening with later units but does not claim old cash history', () => {
    expect(positionFromObservation(etf, 2, 2, anchor)).toMatchObject({ quantity: 5, residual: 0, history_status: 'reconciled' })
    expect(positionFromObservation(etf, 2, 3, anchor)).toMatchObject({ quantity: 5, residual: -1, history_status: 'mismatch' })
  })
  it('keeps unknown acquisition history when activity happens to equal observed units', () => {
    expect(positionFromObservation(etf, 5, 0, { ...anchor, kind: 'observed' })).toMatchObject({ residual: 0, history_status: 'unverified', coverage_reasons: ['unknown_opening'] })
  })
  it('prices a manual ETF per unit and a manual total asset once', () => {
    expect(holdingNativeValue({ ...etf, pricing_method: 'manual', manual_price: 12 })).toEqual({ value: 60, currency: 'EUR' })
    expect(holdingNativeValue({ ...etf, asset_type: 'manual', currency: 'HUF', balance: 500 })).toEqual({ value: 500, currency: 'HUF' })
  })
  it('distinguishes missing unit price, zero price and empty units', () => {
    expect(holdingNativeValue(etf).value).toBeNull()
    expect(holdingNativeValue({ ...etf, pricing_method: 'manual', manual_price: 0 }).value).toBe(0)
    expect(holdingNativeValue({ ...etf, balance: 0 }).value).toBe(0)
    expect(holdingNativeValue({ ...etf, pricing_method: 'manual', manual_price: Infinity }).value).toBeNull()
  })
  it.each([0, 1e-12, 0.123456789012, 1e12])('accepts supported unit precision %s', value => expect(validHoldingNumber(value)).toBe(true))
  it.each([-1, 1e-13, 1e13, Infinity, NaN, 0.1234567890123])('rejects unsupported unit precision %s', value => expect(validHoldingNumber(value)).toBe(false))
  it('validates actual calendar dates, including leap days', () => {
    expect(validLocalDate('2028-02-29')).toBe(true)
    expect(validLocalDate('2026-02-29')).toBe(false)
    expect(validLocalDate('2026-02-30')).toBe(false)
    expect(validLocalDate('2026-13-01')).toBe(false)
  })
})

it('does not round away one minimum supported crypto unit when reconciling', () => {
  expect(positionFromObservation({ ...etf, balance: 1e-12 }, 0, 0, { ...anchor, balance: 0 })).toMatchObject({ residual: 1e-12, history_status: 'mismatch' })
})
