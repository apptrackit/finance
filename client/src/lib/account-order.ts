import { convertCurrency } from '../../../shared/currency'
import type { ConversionResult } from '../../../shared/currency'

export type ValuedAccount = {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  quote_currency?: string
  symbol?: string
  asset_type?: string
}

export type AccountQuote = { regularMarketPrice?: number; currency?: string }
export type AccountSortValues = Record<string, number | null | undefined>

// Cash/manual assets hold native money; market holdings hold units priced in a
// separate quote currency. Convert every sort key to the same reporting currency.
export function accountValueForOrdering(
  account: ValuedAccount, quotes: Record<string, AccountQuote>,
  currency: string, rates: Record<string, number>, baseCurrency = currency,
): ConversionResult {
  if (account.type !== 'investment' || account.asset_type === 'manual') {
    return convertCurrency(account.balance, account.currency, currency, rates, baseCurrency)
  }
  // An empty position is worth zero without requiring a market quote.
  if (account.balance === 0) return { status: 'converted', value: 0, missingCurrencies: [] }
  const quote = account.symbol ? quotes[account.symbol] : undefined
  const price = quote?.regularMarketPrice
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return { status: 'missing_rate', value: null, missingCurrencies: [] }
  }
  return convertCurrency(account.balance * price, account.quote_currency || quote?.currency || 'USD', currency, rates, baseCurrency)
}

export function sortAccountsByValue<T extends Pick<ValuedAccount, 'id' | 'name'>>(
  accounts: readonly T[], values: AccountSortValues,
): T[] {
  return [...accounts].sort((left, right) => {
    const leftValue = values[left.id], rightValue = values[right.id]
    const leftKnown = typeof leftValue === 'number' && Number.isFinite(leftValue)
    const rightKnown = typeof rightValue === 'number' && Number.isFinite(rightValue)
    if (leftKnown && rightKnown && leftValue !== rightValue) return rightValue - leftValue
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }) || left.id.localeCompare(right.id)
  })
}
