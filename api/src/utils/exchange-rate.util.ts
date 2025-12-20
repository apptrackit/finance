import { D1Database } from '@cloudflare/workers-types'
import { MarketDataRepository } from '../repositories/market-data.repository'

export async function getExchangeRates(
  fromCurrency: string,
  db?: D1Database,
  forceRefresh: boolean = false
): Promise<Record<string, number>> {
  // If database is provided, try to get cached rates
  if (db) {
    const repo = new MarketDataRepository(db)
    
    if (!forceRefresh) {
      const cachedRates = await repo.getAllExchangeRates(fromCurrency)
      
      // Check if we have cached data and if it's still fresh
      if (Object.keys(cachedRates).length > 0) {
        // Check if the oldest rate is still valid (within 1 hour)
        const oldestFetchedAt = Math.min(...Object.values(cachedRates).map(r => r.fetchedAt))
        
        if (!repo.isStale(oldestFetchedAt)) {
          // Return just the rates, not the metadata
          const rates: Record<string, number> = {}
          for (const [currency, data] of Object.entries(cachedRates)) {
            rates[currency] = data.rate
          }
          return rates
        }
      }
    }
    
    // If no cached data or data is stale or force refresh, fetch new data
    try {
      const freshRates = await fetchExchangeRatesFromAPI(fromCurrency)
      
      // Save to cache
      if (Object.keys(freshRates).length > 0) {
        await repo.saveExchangeRates(fromCurrency, freshRates, Date.now())
        return freshRates
      }
    } catch (error) {
      console.warn(`Failed to fetch fresh exchange rates for ${fromCurrency}, using cached data if available`)
    }
    
    // If fetch failed, try to return stale cached data
    const cachedRates = await repo.getAllExchangeRates(fromCurrency)
    if (Object.keys(cachedRates).length > 0) {
      console.log(`Using stale cached exchange rates for ${fromCurrency}`)
      const rates: Record<string, number> = {}
      for (const [currency, data] of Object.entries(cachedRates)) {
        rates[currency] = data.rate
      }
      return rates
    }
    
    return {}
  }
  
  // No database provided, fetch directly
  return await fetchExchangeRatesFromAPI(fromCurrency)
}

async function fetchExchangeRatesFromAPI(fromCurrency: string): Promise<Record<string, number>> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`)
    if (!response.ok) {
      console.warn(`Exchange rate API responded with non-ok status ${response.status} for currency ${fromCurrency}`)
      return {}
    }

    const data: unknown = await response.json()

    if (
      typeof data === 'object' &&
      data !== null &&
      'result' in data &&
      (data as any).result === 'success' &&
      'rates' in data &&
      typeof (data as any).rates === 'object' &&
      (data as any).rates !== null
    ) {
      return (data as any).rates as Record<string, number>
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'result' in data &&
      (data as any).result === 'error'
    ) {
      const errorType = (data as any)['error-type']
      console.warn(`Exchange rate API error for ${fromCurrency}: ${errorType}`)
      // Return empty for unsupported currencies - the app will handle it gracefully
      return {}
    } else {
      console.warn('Unexpected exchange rates response shape', data)
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
  }
  return {}
}

