import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export class MarketDataService {
  async searchSymbol(query: string): Promise<any> {
    return await yahooFinance.search(query)
  }

  async getQuote(symbol: string): Promise<any> {
    return await yahooFinance.quote(symbol)
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

    const result: any = await yahooFinance.chart(symbol, queryOptions)
    return { quotes: result.quotes }
  }
}
