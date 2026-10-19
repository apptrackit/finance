import type { MarketQuote } from './types'

// Presentation only: never relax the server's 20-minute return-coverage rule.
export function quotePresentation(quote: MarketQuote | undefined, now = Date.now()) {
  const timestamp = quote?.as_of ? Date.parse(quote.as_of) : NaN
  const age = now - timestamp
  const price = quote?.price ?? quote?.regularMarketPrice
  const knownPrice = typeof price === 'number' && Number.isFinite(price) && price > 0
  const delayed =
    quote?.status === 'stale' &&
    knownPrice &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 60 * 60_000
  const needsAttention = quote?.status === 'stale' && !delayed
  const minutes = Math.max(1, Math.floor(age / 60_000))
  return {
    delayed,
    needsAttention,
    label: delayed
      ? 'Delayed price'
      : needsAttention
        ? 'Stale price'
        : quote?.status === 'last_close'
          ? 'Last close'
          : 'Price as of',
    ageLabel: delayed ? `updated ${minutes} minute${minutes === 1 ? '' : 's'} ago` : null,
  }
}
