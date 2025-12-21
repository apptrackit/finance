import { D1Database } from '@cloudflare/workers-types'
import { MarketDataRepository } from '../repositories/market-data.repository'

export async function fetchPriceFromYahoo(
  symbol: string,
  date: string,
  db?: D1Database,
  forceRefresh: boolean = false
): Promise<number> {
  // If database is provided, try to get cached price
  if (db) {
    const repo = new MarketDataRepository(db)
    
    if (!forceRefresh) {
      const cachedPrice = await repo.getStockPrice(symbol)
      
      // Use cached price if available, even if stale (to avoid Yahoo Finance rate limits)
      // Only fetch fresh data if explicitly forced or no cache exists
      if (cachedPrice) {
        const ageInHours = (Date.now() - cachedPrice.fetchedAt) / (1000 * 60 * 60)
        console.log(`Using cached price for ${symbol}: $${cachedPrice.price} (${ageInHours.toFixed(1)}h old)`)
        return cachedPrice.price
      }
    }
    
    // If no cached data or data is stale or force refresh, fetch new data
    try {
      console.log(`[YahooFinance] Fetching price for ${symbol} on ${date}`)
      const freshPrice = await fetchPriceFromYahooAPI(symbol, date)
      console.log(`[YahooFinance] Got price ${freshPrice} for ${symbol}`)
      
      // Save to cache if we got a valid price
      if (freshPrice > 0) {
        console.log(`[YahooFinance] Attempting to save ${symbol} price ${freshPrice} to cache`)
        await repo.saveStockPrice(symbol, freshPrice, Date.now())
        console.log(`[YahooFinance] ✓ Successfully saved ${symbol} to cache`)
        return freshPrice
      } else {
        console.warn(`[YahooFinance] Not saving ${symbol} - price is ${freshPrice}`)
      }
    } catch (error: any) {
      // If rate limited or fetch failed, fall back to cached data
      if (error.message?.includes('RATE_LIMITED')) {
        console.warn(`Rate limited fetching ${symbol}, using cached data if available`)
      } else {
        console.warn(`Failed to fetch ${symbol}, using cached data if available:`, error.message)
      }
      
      const cachedPrice = await repo.getStockPrice(symbol)
      if (cachedPrice) {
        console.log(`Using stale cached price for ${symbol}: $${cachedPrice.price}`)
        return cachedPrice.price
      }
      
      // No cached data available - silently return 0 instead of throwing
      console.warn(`No cached data available for ${symbol}, returning 0`)
      return 0
    }
    
    // If we got here with price 0, try cached data
    const cachedPrice = await repo.getStockPrice(symbol)
    if (cachedPrice) {
      console.log(`Using cached price for ${symbol} (fresh fetch returned 0)`)
      return cachedPrice.price
    }
    
    return 0
  }
  
  // No database provided, fetch directly
  return await fetchPriceFromYahooAPI(symbol, date)
}

async function fetchPriceFromYahooAPI(symbol: string, date: string): Promise<number> {
  try {
    const quoteRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&period1=${Math.floor(new Date(date).getTime() / 1000)}&period2=${Math.floor(new Date(date).getTime() / 1000) + 86400}`
    )
    
    // Check for rate limiting before parsing JSON
    if (quoteRes.status === 429) {
      throw new Error('RATE_LIMITED')
    }
    
    if (!quoteRes.ok) {
      const text = await quoteRes.text()
      if (text.includes('Too Many Requests')) {
        throw new Error('RATE_LIMITED')
      }
      console.warn(`Yahoo Finance API returned status ${quoteRes.status} for ${symbol}`)
      return 0
    }
    
    const quoteData: any = await quoteRes.json()
    
    if (quoteData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return quoteData.chart.result[0].meta.regularMarketPrice
    } else if (quoteData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0]) {
      return quoteData.chart.result[0].indicators.quote[0].close[0]
    }
    
    // If still no price, try current price
    const currentQuoteRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    )
    const currentQuoteData: any = await currentQuoteRes.json()
    if (currentQuoteData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return currentQuoteData.chart.result[0].meta.regularMarketPrice
    }

    return 0
  } catch (error: any) {
    // Yahoo Finance rate limit - throw specific error without logging full stack
    if (error.message && error.message.includes('RATE_LIMITED')) {
      throw new Error('RATE_LIMITED')
    }
    
    console.error(`Failed to fetch price for ${symbol}:`, error.message || error)
    throw new Error(`FETCH_FAILED: ${error.message || error}`)
  }
}

