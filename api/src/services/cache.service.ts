import { D1Database } from '@cloudflare/workers-types'
import { MarketDataRepository } from '../repositories/market-data.repository'
import { getExchangeRates } from '../utils/exchange-rate.util'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'
import { AccountRepository } from '../repositories/account.repository'
import { StartupSyncService } from './startup-sync.service'

export class CacheService {
  constructor(
    private db: D1Database,
    private accountRepo: AccountRepository
  ) {}

  async refreshMarketData(): Promise<{ 
    exchangeRatesRefreshed: number; 
    stockPricesRefreshed: number;
    message: string 
  }> {
    const marketDataRepo = new MarketDataRepository(this.db)
    
    let exchangeRatesRefreshed = 0
    let stockPricesRefreshed = 0

    // Get all unique currencies used in accounts
    const accounts = await this.accountRepo.findAll()
    const currencies = new Set<string>()
    const stockSymbols = new Set<string>()

    for (const account of accounts) {
      if (account.currency) {
        currencies.add(account.currency)
      }
      if (account.type === 'investment' && account.symbol && account.asset_type !== 'manual') {
        stockSymbols.add(account.symbol)
      }
    }

    // Refresh exchange rates for all currency pairs
    const currencyArray = Array.from(currencies)
    // Filter out crypto/investment "currencies" that aren't real ISO codes
    const realCurrencies = currencyArray.filter(c => 
      !['BTC', 'ETH', 'SHARE'].includes(c) && c.length === 3
    )
    
    console.log(`Starting exchange rate refresh for ${realCurrencies.length} currencies: ${realCurrencies.join(', ')}`)
    
    for (const baseCurrency of realCurrencies) {
      try {
        // Force refresh by passing forceRefresh = true
        const rates = await getExchangeRates(baseCurrency, this.db, true)
        if (Object.keys(rates).length > 0) {
          exchangeRatesRefreshed++
          console.log(`✓ ${baseCurrency}: ${Object.keys(rates).length} rates fetched`)
        } else {
          console.warn(`✗ ${baseCurrency}: No rates returned`)
        }
      } catch (error) {
        console.error(`✗ Failed to refresh exchange rates for ${baseCurrency}:`, error)
      }
    }
    
    console.log(`Exchange rate refresh complete: ${exchangeRatesRefreshed}/${realCurrencies.length} successful`)

    // Refresh stock prices for all investment accounts
    const today = new Date().toISOString().split('T')[0]
    let delay = 5000 // Start with 5 second delay
    let consecutiveRateLimits = 0
    let isFirstRequest = true
    
    console.log(`Starting stock price refresh for ${stockSymbols.size} symbols...`)
    
    for (const symbol of stockSymbols) {
      // If we've been rate limited 3 times in a row, stop trying
      if (consecutiveRateLimits >= 3) {
        console.warn(`⚠ Stopping refresh after ${consecutiveRateLimits} consecutive rate limits. Please try again later.`)
        break
      }
      
      // Add delay BEFORE each request (except the first one)
      if (!isFirstRequest) {
        const jitter = delay * 0.2 * (Math.random() - 0.5)
        const actualDelay = delay + jitter
        console.log(`Waiting ${Math.round(actualDelay)}ms before next request...`)
        await new Promise(resolve => setTimeout(resolve, actualDelay))
      }
      isFirstRequest = false
      
      console.log(`Fetching ${symbol}...`)
      
      try {
        // Force refresh by passing forceRefresh = true
        const price = await fetchPriceFromYahoo(symbol, today, this.db, true)
        if (price > 0) {
          stockPricesRefreshed++
          consecutiveRateLimits = 0 // Reset on success
          console.log(`✓ ${symbol}: $${price.toFixed(2)}`)
          // Reset delay on success
          delay = 5000
        } else {
          console.warn(`✗ ${symbol}: Got price 0 (no cached data or failed fetch)`)
          consecutiveRateLimits = 0 // Don't count missing cache as rate limit
        }
      } catch (error: any) {
        if (error.message?.includes('RATE_LIMITED')) {
          consecutiveRateLimits++
          console.warn(`⚠ Rate limited on ${symbol} (${consecutiveRateLimits}/3), increasing delay from ${delay}ms to ${Math.min(delay * 2, 20000)}ms`)
          // Exponential backoff: double the delay
          delay = Math.min(delay * 2, 20000) // Max 20 seconds
        } else {
          console.error(`✗ Failed to refresh stock price for ${symbol}:`, error.message)
        }
        // Continue with other symbols even if one fails
      }
    }
    
    console.log(`Stock price refresh complete: ${stockPricesRefreshed}/${stockSymbols.size} successful`)
    
    if (consecutiveRateLimits >= 3) {
      console.warn(`⚠ Yahoo Finance rate limit detected. Market data will use cached values until the limit resets.`)
    }

    return {
      exchangeRatesRefreshed,
      stockPricesRefreshed,
      message: `Refreshed ${exchangeRatesRefreshed} exchange rate sets and ${stockPricesRefreshed} stock prices`
    }
  }

  async clearMarketDataCache(): Promise<{ message: string }> {
    const marketDataRepo = new MarketDataRepository(this.db)
    
    await marketDataRepo.deleteExchangeRates()
    await marketDataRepo.deleteStockPrices()

    return {
      message: 'Market data cache cleared successfully'
    }
  }

  async getCacheStatus(): Promise<{
    exchangeRatesCount: number;
    stockPricesCount: number;
    oldestExchangeRate: number | null;
    oldestStockPrice: number | null;
  }> {
    // Get counts and oldest timestamps from cache
    const exchangeRatesResult = await this.db
      .prepare('SELECT COUNT(*) as count, MIN(fetched_at) as oldest FROM exchange_rates')
      .first()

    const stockPricesResult = await this.db
      .prepare('SELECT COUNT(*) as count, MIN(fetched_at) as oldest FROM stock_prices')
      .first()

    return {
      exchangeRatesCount: (exchangeRatesResult?.count as number) || 0,
      stockPricesCount: (stockPricesResult?.count as number) || 0,
      oldestExchangeRate: (exchangeRatesResult?.oldest as number) || null,
      oldestStockPrice: (stockPricesResult?.oldest as number) || null
    }
  }

  async getSyncStatus(): Promise<any> {
    const marketDataRepo = new MarketDataRepository(this.db)
    const syncService = new StartupSyncService(this.db, this.accountRepo, marketDataRepo)
    return await syncService.getSyncStatus()
  }

  async syncMissingData(): Promise<{ message: string; details: any }> {
    const marketDataRepo = new MarketDataRepository(this.db)
    const syncService = new StartupSyncService(this.db, this.accountRepo, marketDataRepo)
    
    await syncService.syncMarketData()
    
    const status = await syncService.getSyncStatus()
    
    return {
      message: 'Sync completed',
      details: status
    }
  }
}
