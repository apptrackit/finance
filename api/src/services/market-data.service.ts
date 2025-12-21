import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export class MarketDataService {
  async searchSymbol(query: string): Promise<any> {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Search timeout')), 5000)
      )
      const searchPromise = yahooFinance.search(query)
      
      return await Promise.race([searchPromise, timeoutPromise])
    } catch (error: any) {
      console.error('Market search failed:', error.message)
      // Return empty results instead of hanging
      return { quotes: [] }
    }
  }

  async getQuote(symbol: string): Promise<any> {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Quote timeout')), 5000)
      )
      const quotePromise = yahooFinance.quote(symbol)
      
      return await Promise.race([quotePromise, timeoutPromise])
    } catch (error: any) {
      console.error('Get quote failed:', error.message)
      return null
    }
  }

  async getChart(symbol: string, range: string = '1mo', interval: string = '1d'): Promise<any> {
    try {
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

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Chart timeout')), 5000)
      )
      const chartPromise = yahooFinance.chart(symbol, queryOptions)
      
      const result: any = await Promise.race([chartPromise, timeoutPromise])
      return { quotes: result.quotes }
    } catch (error: any) {
      console.error('Get chart failed:', error.message)
      return { quotes: [] }
    }
  }
}
