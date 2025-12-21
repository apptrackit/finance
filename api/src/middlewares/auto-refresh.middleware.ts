import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'
import { MarketDataRepository } from '../repositories/market-data.repository'
import { getExchangeRates } from '../utils/exchange-rate.util'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'
import { AccountRepository } from '../repositories/account.repository'

let isRefreshing = false
let lastRefreshCheck = 0

export async function autoRefreshMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const db = c.env.DB
  const now = Date.now()
  
  // Check every 5 minutes if we need to refresh (not on every single request)
  if (!isRefreshing && (now - lastRefreshCheck) > 5 * 60 * 1000) {
    lastRefreshCheck = now
    
    // Don't await - refresh in background
    refreshStaleDataInBackground(db).catch(err => {
      console.error('Background refresh failed:', err)
    })
  }
  
  await next()
}

async function refreshStaleDataInBackground(db: any) {
  if (isRefreshing) return
  
  isRefreshing = true
  console.log('🔄 Checking for stale market data...')
  
  try {
    const repo = new MarketDataRepository(db)
    const accountRepo = new AccountRepository(db)
    
    // Check exchange rates
    const accounts = await accountRepo.findAll()
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
    
    // Check if exchange rates are stale
    const realCurrencies = Array.from(currencies).filter(c => 
      !['BTC', 'ETH', 'SHARE'].includes(c) && c.length === 3
    )
    
    let needsExchangeRefresh = false
    for (const currency of realCurrencies) {
      const rates = await repo.getAllExchangeRates(currency)
      if (Object.keys(rates).length === 0) {
        needsExchangeRefresh = true
        break
      }
      const oldestFetchedAt = Math.min(...Object.values(rates).map(r => r.fetchedAt))
      if (repo.isStale(oldestFetchedAt)) {
        needsExchangeRefresh = true
        console.log(`📊 Exchange rates for ${currency} are stale, refreshing...`)
        break
      }
    }
    
    // Check if stock prices are stale
    const staleSymbols: string[] = []
    for (const symbol of stockSymbols) {
      const price = await repo.getStockPrice(symbol)
      if (!price || repo.isStale(price.fetchedAt)) {
        staleSymbols.push(symbol)
      }
    }
    
    if (staleSymbols.length > 0) {
      console.log(`📈 ${staleSymbols.length} stock prices are stale: ${staleSymbols.join(', ')}`)
    }
    
    // Refresh stale data
    if (needsExchangeRefresh) {
      for (const currency of realCurrencies) {
        try {
          await getExchangeRates(currency, db, false) // false = only refresh if stale
          console.log(`✓ Refreshed exchange rates for ${currency}`)
        } catch (error) {
          console.warn(`Failed to refresh ${currency}:`, error)
        }
      }
    }
    
    if (staleSymbols.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      let delay = 0
      
      for (const symbol of staleSymbols) {
        // Spread out requests with delays
        setTimeout(async () => {
          try {
            await fetchPriceFromYahoo(symbol, today, db, false) // false = only refresh if stale
            console.log(`✓ Refreshed stock price for ${symbol}`)
          } catch (error) {
            console.warn(`Failed to refresh ${symbol}:`, error)
          }
        }, delay)
        
        delay += 3000 // 3 second delay between each
      }
    }
    
    if (!needsExchangeRefresh && staleSymbols.length === 0) {
      console.log('✓ All market data is fresh')
    }
    
  } finally {
    isRefreshing = false
  }
}
