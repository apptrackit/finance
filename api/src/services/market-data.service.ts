import YahooFinance from 'yahoo-finance2'

// Configure YahooFinance with browser-like headers to avoid blocking
// Yahoo Finance blocks requests without proper User-Agent headers
const yahooFinance = new YahooFinance({
  queue: {
    concurrency: 1,  // Reduce to 1 concurrent request to avoid rate limits
    timeout: 30000   // 30 second timeout
  },
  validation: {
    logErrors: false  // Reduce noise in logs
  }
})

// Module-level fetch options with browser User-Agent
// This needs to be passed to each request
const fetchOptions = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}

// Helper function to retry requests with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isRateLimited = error.code === 429 || 
                           error.message?.includes('Too Many Requests') ||
                           error.message?.includes('RATE_LIMITED')
      
      const isLastAttempt = attempt === maxRetries - 1
      
      if (isRateLimited && !isLastAttempt) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      throw error
    }
  }
  
  throw new Error('Max retries exceeded')
}

export class MarketDataService {
  async searchSymbol(query: string): Promise<any> {
    return await retryWithBackoff(() => yahooFinance.search(query, {}, { fetchOptions }))
  }

  async getQuote(symbol: string): Promise<any> {
    // Note: yahooFinance.quote() requires a "crumb" which Yahoo Finance often blocks
    // Instead, use the chart endpoint which doesn't require authentication
    // and provides current price in the metadata
    return await retryWithBackoff(async () => {
      const chartData = await yahooFinance.chart(symbol, {
        period1: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        interval: '1d'
      }, { fetchOptions })
      
      // Transform chart response to match quote response format
      return {
        symbol: chartData.meta.symbol,
        regularMarketPrice: chartData.meta.regularMarketPrice,
        currency: chartData.meta.currency,
        shortName: chartData.meta.shortName || chartData.meta.longName,
        longName: chartData.meta.longName,
        regularMarketChangePercent: chartData.meta.regularMarketChangePercent,
        regularMarketChange: chartData.meta.regularMarketChange,
        regularMarketTime: chartData.meta.regularMarketTime,
        marketState: chartData.meta.marketState,
        exchangeName: chartData.meta.exchangeName,
        quoteType: chartData.meta.instrumentType
      }
    })
  }

  async getChart(symbol: string, range: string = '1mo', interval: string = '1d'): Promise<any> {
    const now = new Date()
    let period1 = new Date()

    switch (range) {
      case '1d':
        period1.setDate(now.getDate() - 1)
        break
      case '5d':
        period1.setDate(now.getDate() - 5)
        break
      case '1mo':
        period1.setMonth(now.getMonth() - 1)
        break
      case '6mo':
        period1.setMonth(now.getMonth() - 6)
        break
      case '1y':
        period1.setFullYear(now.getFullYear() - 1)
        break
      case '5y':
        period1.setFullYear(now.getFullYear() - 5)
        break
      case 'max':
        period1 = new Date(0)
        break
      default:
        period1.setMonth(now.getMonth() - 1)
    }

    const queryOptions = {
      period1: Math.floor(period1.getTime() / 1000), // Unix timestamp in seconds
      interval: interval as any
    }

    const result: any = await retryWithBackoff(() => 
      yahooFinance.chart(symbol, queryOptions, { fetchOptions })
    )
    return { quotes: result.quotes }
  }
}
