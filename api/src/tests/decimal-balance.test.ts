import { expect, it } from 'vitest'
import {
  addDecimal,
  recoverLedgerResidue,
} from '../../../shared/decimal-balance'

it.each([
  [[0.1, 0.2], 0.3],
  [[0.8, -0.7], 0.1],
  [[-0.1, -0.2], -0.3],
  [[123.45, -123.4, -0.05], 0],
  [[1e-13, 1e-13], 2e-13],
  [[0.123456789012, 0.000000000001], 0.123456789013],
  [[1e20, -1e20, 0.3], 0.3],
  [[1e-7, -1e-7], 0],
] as const)(
  'adds recorded decimals without binary accumulation: %j',
  (values, expected) => {
    expect(addDecimal(...values)).toBe(expected)
  },
)
it.each([
  [1e16, 1],
  [Number.MAX_VALUE, Number.MAX_VALUE],
  [Infinity, 1],
  [NaN, 1],
])('refuses nonfinite or lost precision: %j', (...values) => {
  expect(() => addDecimal(...values)).toThrow()
})
it('recovers only a narrow difference supported by posted source facts', () => {
  expect(recoverLedgerResidue(0.1 + 0.2, [0.1, 0.2], 0.01)).toEqual({
    value: 0.3,
    evidence_count: 2,
  })
  expect(
    recoverLedgerResidue(0.31234567800000006, [0.312345678], 1e-12),
  ).toEqual({ value: 0.312345678, evidence_count: 1 })
  expect(recoverLedgerResidue(0.3123456780001, [0.312345678], 1e-12)).toBeNull()
  expect(recoverLedgerResidue(0.300000001, [0.1, 0.2], 0.01)).toBeNull()
  expect(recoverLedgerResidue(0.1 + 0.2, [], 0.01)).toBeNull()
  expect(
    recoverLedgerResidue(0.1 + 0.2, Array(10001).fill(0.1), 0.01),
  ).toBeNull()
  expect(
    recoverLedgerResidue(0.123456789012, [0.123456789012], 0.01),
  ).toBeNull()
})
