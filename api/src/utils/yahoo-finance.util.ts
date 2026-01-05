export async function fetchPriceFromYahoo(symbol: string, date: string): Promise<number> {
  try {
    // Yahoo Finance requires a browser User-Agent header to avoid blocking
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    const quoteRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&period1=${Math.floor(new Date(date).getTime() / 1000)}&period2=${Math.floor(new Date(date).getTime() / 1000) + 86400}`,
      { headers }
    )
    const quoteData: any = await quoteRes.json()
    
    if (quoteData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return quoteData.chart.result[0].meta.regularMarketPrice
    } else if (quoteData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0]) {
      return quoteData.chart.result[0].indicators.quote[0].close[0]
    }
    
    // If still no price, try current price
    const currentQuoteRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers }
    )
    const currentQuoteData: any = await currentQuoteRes.json()
    if (currentQuoteData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return currentQuoteData.chart.result[0].meta.regularMarketPrice
    }

    return 0
  } catch (error: any) {
    console.error('Failed to fetch price:', error)
    
    // Yahoo Finance rate limit - throw specific error
    if (error.message && error.message.includes('Too Many Requests')) {
      throw new Error('RATE_LIMITED')
    }
    
    throw new Error(`FETCH_FAILED: ${error.message || error}`)
  }
}
