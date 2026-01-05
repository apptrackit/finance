import { Context } from 'hono'
import { MarketDataService } from '../services/market-data.service'

export class MarketDataController {
  constructor(private marketDataService: MarketDataService) {}

  async search(c: Context) {
    try {
      const query = c.req.query('q')
      if (!query) {
        return c.json({ error: 'Query parameter "q" is required' }, 400)
      }
      const result = await this.marketDataService.searchSymbol(query)
      return c.json(result)
    } catch (error: any) {
      console.error('Yahoo Finance Search Error:', error)
      
      // Check if it's a rate limit error
      if (error.code === 429 || error.message?.includes('Too Many Requests')) {
        return c.json({ error: 'Yahoo Finance rate limit exceeded. Please try again in a moment.' }, 429)
      }
      
      return c.json({ error: 'Failed to fetch market data' }, 500)
    }
  }

  async quote(c: Context) {
    try {
      const symbol = c.req.query('symbol')
      if (!symbol) {
        return c.json({ error: 'Query parameter "symbol" is required' }, 400)
      }
      const result = await this.marketDataService.getQuote(symbol)
      return c.json(result)
    } catch (error: any) {
      console.error('Yahoo Finance Quote Error:', error)
      
      if (error.code === 429 || error.message?.includes('Too Many Requests')) {
        return c.json({ error: 'Yahoo Finance rate limit exceeded. Please try again in a moment.' }, 429)
      }
      
      return c.json({ error: 'Failed to fetch quote data' }, 500)
    }
  }

  async chart(c: Context) {
    try {
      const symbol = c.req.query('symbol')
      const range = c.req.query('range') || '1mo'
      const interval = c.req.query('interval') || '1d'

      if (!symbol) {
        return c.json({ error: 'Query parameter "symbol" is required' }, 400)
      }

      const result = await this.marketDataService.getChart(symbol, range, interval)
      return c.json(result)
    } catch (error: any) {
      console.error('Yahoo Finance Chart Error:', error)
      
      if (error.code === 429 || error.message?.includes('Too Many Requests')) {
        return c.json({ error: 'Yahoo Finance rate limit exceeded. Please try again in a moment.' }, 429)
      }
      
      return c.json({ error: 'Failed to fetch chart data' }, 500)
    }
  }
}
