import { expect, it } from 'vitest'
import {
  recordedHistory,
  effectivePositionAnchor,
  applyRecordedHistory,
} from '../../../shared/holding'
import type {
  PositionAnchor,
  RecordedTrade,
  HoldingPosition,
} from '../../../shared/holding'
const anchor: PositionAnchor = {
  id: 'observed',
  kind: 'observed',
  effective_date: '2026-01-15',
  balance: 2,
  cost_amount: null,
  cost_currency: null,
  trade_rowid_boundary: 1,
  created_at: 1,
}
const account = {
  id: 'holding',
  type: 'investment',
  asset_type: 'stock',
  currency: 'SHARE',
  balance: 2,
  holding_position: {
    quantity: 2,
    activity_quantity: 2,
    residual: 0,
    history_status: 'unverified' as const,
    coverage_reasons: ['unknown_opening', 'unknown_cost'],
    anchor,
  } as HoldingPosition,
}
const buy: RecordedTrade = {
  id: 'buy',
  type: 'buy',
  quantity: 2,
  date: '2026-01-03',
  effective_order: 1,
}
it('uses the actual complete recorded ledger as a calculated zero start without replacing its saved observation', () => {
  const a = applyRecordedHistory(account, [buy], '2026-01-15')
  expect(a.holding_position.recorded_history).toEqual({
    effective_date: '2026-01-02',
    first_trade_date: '2026-01-03',
    quantity: 2,
    trade_count: 1,
  })
  expect(a.holding_position.anchor).toBe(anchor)
  expect(a.holding_position.history_status).toBe('reconciled')
  expect(effectivePositionAnchor(a)).toMatchObject({
    kind: 'opening',
    balance: 0,
    effective_date: '2026-01-02',
  })
  expect(a.balance).toBe(2)
})
it.each(
  [
    [{ ...buy, date: '2026-01-16' }],
    [{ ...buy, date: '2026-02-30' }],
    [{ ...buy, type: 'sell' }],
    [{ ...buy, quantity: 1 }],
    [{ ...buy, effective_order: 0 }],
    [{ ...buy, quantity: 2.0000000000001 }],
    [
      { ...buy, quantity: 3, type: 'sell', date: '2026-01-02' },
      { ...buy, quantity: 5, effective_order: 2 },
    ],
    [
      { ...buy, quantity: 1 },
      { ...buy, id: 'other', quantity: 1 },
    ],
  ].map((trades) => ({ trades })),
)(
  'refuses incomplete/invalid/negative/future/ambiguous history %j',
  ({ trades }) => {
    expect(recordedHistory(account, trades, '2026-01-15')).toBeNull()
  },
)
it.each(['opening', 'correction'] as const)(
  'preserves an explicit %s even if recorded trades match current units',
  (kind) => {
    expect(
      recordedHistory(
        {
          ...account,
          holding_position: {
            ...account.holding_position,
            anchor: { ...anchor, kind },
          },
        },
        [buy],
        '2026-01-15',
      ),
    ).toBeNull()
  },
)
it('keeps minimum units meaningful and accepts only narrow supported residue', () => {
  const q = 0.312345678
  expect(
    recordedHistory(
      { ...account, balance: Number('0.31234567800000006') },
      [{ ...buy, quantity: q }],
      '2026-01-15',
    )?.quantity,
  ).toBe(q)
  expect(
    recordedHistory(
      { ...account, balance: q + 1e-12 },
      [{ ...buy, quantity: q }],
      '2026-01-15',
    ),
  ).toBeNull()
  expect(
    recordedHistory({ ...account, balance: 1e-12 }, [], '2026-01-15'),
  ).toBeNull()
})
it('bounds the complete evidence and leaves manual ownership on its separate path', () => {
  expect(
    recordedHistory(account, Array(10001).fill(buy), '2026-01-15'),
  ).toBeNull()
  expect(
    recordedHistory({ ...account, asset_type: 'manual' }, [buy], '2026-01-15'),
  ).toBeNull()
})
