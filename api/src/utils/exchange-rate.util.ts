import { validRates } from '../../../shared/currency'
import { logger } from './logger'

export async function getExchangeRates(fromCurrency: string): Promise<Record<string, number>> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`)
    if (!response.ok) {
      logger.warn('Exchange rate service unavailable', { currency: fromCurrency, status: response.status })
      return {}
    }
    const data: unknown = await response.json()
    if (typeof data === 'object' && data !== null && 'result' in data && data.result === 'success' && 'rates' in data) {
      return validRates(data.rates)
    }
    logger.warn('Invalid exchange rate response', { currency: fromCurrency })
  } catch {
    logger.warn('Exchange rate fetch failed', { currency: fromCurrency })
  }
  return {}
}
