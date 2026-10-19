import { expect, it } from 'vitest'
import { quotePresentation } from './quote-presentation'
const now = Date.parse('2026-10-19T07:11:00Z')
it.each([26, 60])(
  'shows a known %s-minute delayed quote without actionable attention',
  (minutes) => {
    expect(
      quotePresentation(
        {
          symbol: 'TEST',
          price: 100,
          status: 'stale',
          as_of: new Date(now - minutes * 60_000).toISOString(),
        },
        now,
      ),
    ).toMatchObject({
      delayed: true,
      needsAttention: false,
      label: 'Delayed price',
      ageLabel: `updated ${minutes} minutes ago`,
    })
  },
)
it.each([61, 1440, -1, NaN])(
  'retains attention for old or untrustworthy source age %s',
  (minutes) => {
    expect(
      quotePresentation(
        {
          symbol: 'TEST',
          price: 100,
          status: 'stale',
          as_of: Number.isFinite(minutes)
            ? new Date(now - minutes * 60_000).toISOString()
            : 'invalid',
        },
        now,
      ),
    ).toMatchObject({ delayed: false, needsAttention: true, label: 'Stale price' })
  },
)
it('never substitutes retrieval time or a delayed badge for a missing timestamp or price', () => {
  for (const patch of [{ as_of: null }, { price: null }, { price: NaN }])
    expect(
      quotePresentation(
        {
          symbol: 'TEST',
          price: 100,
          status: 'stale',
          as_of: new Date(now - 26 * 60_000).toISOString(),
          retrieved_at: new Date(now).toISOString(),
          ...patch,
        },
        now,
      ).needsAttention,
    ).toBe(true)
  expect(quotePresentation(undefined, now).delayed).toBe(false)
})
