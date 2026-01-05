// Yahoo Finance API direct fetch implementation
// Using direct fetch instead of yahoo-finance2 library for better Cloudflare Workers compatibility

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    return await retryWithBackoff(async () => {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?` +
        `q=${encodeURIComponent(query)}` +
        `&lang=en-US&region=US&quotesCount=6&newsCount=4&enableFuzzyQuery=false` +
        `&quotesQueryId=tss_match_phrase_query&multiQuoteQueryId=multi_quote_single_token_query` +
        `&newsQueryId=news_cie_vespa&enableCb=true&enableNavLinks=true&enableEnhancedTrivialQuery=true`
      
      const response = await fetch(url, { headers: YAHOO_HEADERS })
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance search failed: ${response.status} ${response.statusText}`)
      }
      
      return await response.json()
    })
  }

  async getQuote(symbol: string): Promise<any> {
    return await retryWithBackoff(async () => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      
      const response = await fetch(url, { headers: YAHOO_HEADERS })
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance quote failed: ${response.status} ${response.statusText}`)
      }
      
      const data: any = await response.json()
      const result = data?.chart?.result?.[0]
      const meta = result?.meta
      
      if (!meta) {
        throw new Error('No data returned from Yahoo Finance')
      }
      
      // Return in a format similar to yahoo-finance2 quote response
      return {
        symbol: meta.symbol,
        regularMarketPrice: meta.regularMarketPrice,
        currency: meta.currency,
        shortName: meta.shortName || meta.longName,
        longName: meta.longName,
        regularMarketChangePercent: meta.regularMarketChangePercent,
        regularMarketChange: meta.regularMarketChange,
        regularMarketTime: meta.regularMarketTime,
        marketState: meta.marketState,
        exchangeName: meta.exchangeName,
        quoteType: meta.instrumentType
      }
    })
  }

  async getChart(symbol: string, range: string = '1mo', interval: string = '1d'): Promise<any> {
    return await retryWithBackoff(async () => {
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

      const period1Ts = Math.floor(period1.getTime() / 1000)
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?` +
        `interval=${interval}&period1=${period1Ts}`

      const response = await fetch(url, { headers: YAHOO_HEADERS })
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance chart failed: ${response.status} ${response.statusText}`)
      }

      const data: any = await response.json()
      const result = data?.chart?.result?.[0]
      
      if (!result) {
        throw new Error('No chart data returned from Yahoo Finance')
      }

      // Transform to match expected format
      const timestamps = result.timestamp || []
      const quotes = result.indicators?.quote?.[0]
      
      const chartQuotes = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000),
        open: quotes?.open?.[i],
        high: quotes?.high?.[i],
        low: quotes?.low?.[i],
        close: quotes?.close?.[i],
        volume: quotes?.volume?.[i]
      }))

      return { quotes: chartQuotes }
    })
  }
}
