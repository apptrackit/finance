/** Rates express units of each currency per one unit of baseCurrency. */
export type ConversionResult =
  | { status: 'converted'; value: number; missingCurrencies: string[] }
  | { status: 'missing_rate'; value: null; missingCurrencies: string[] }

export const isValidRate = (rate: unknown): rate is number =>
  typeof rate === 'number' && Number.isFinite(rate) && rate > 0

export function validRates(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isValidRate(entry[1])))
}

export function convertCurrency(
  amount: number, source: string, target: string,
  rates: Record<string, number>, baseCurrency = target,
): ConversionResult {
  source = source.toUpperCase()
  target = target.toUpperCase()
  baseCurrency = baseCurrency.toUpperCase()
  if (source === target) return { status: 'converted', value: amount, missingCurrencies: [] }
  const sourceRate = source === baseCurrency ? 1 : rates[source]
  const targetRate = target === baseCurrency ? 1 : rates[target]
  const missingCurrencies = [
    ...(!isValidRate(sourceRate) ? [source] : []),
    ...(!isValidRate(targetRate) ? [target] : []),
  ]
  if (missingCurrencies.length) return { status: 'missing_rate', value: null, missingCurrencies }
  const value = amount / sourceRate * targetRate
  if (!Number.isFinite(value)) return { status: 'missing_rate', value: null, missingCurrencies: [source, target] }
  return { status: 'converted', value, missingCurrencies: [] }
}

export function sumConversions(results: ConversionResult[]): ConversionResult {
  const missingCurrencies = [...new Set(results.flatMap(result => result.missingCurrencies))].sort()
  if (results.some(result => result.value === null)) return { status: 'missing_rate', value: null, missingCurrencies }
  return { status: 'converted', value: results.reduce((sum, result) => sum + result.value!, 0), missingCurrencies: [] }
}

export function sumAvailable(values: (number | null)[]): number | null {
  let total = 0
  for (const value of values) {
    if (value === null) return null
    total += value
  }
  return total
}
