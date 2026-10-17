import type { Context } from 'hono'
import { MarketError } from '../../../shared/market-data'
import { AppError } from '../errors/codes'
import { MarketDataService } from '../services/market-data.service'

export class MarketDataController {
  constructor(private readonly service: MarketDataService) {}
  private async read(c: Context, run: () => Promise<unknown>) {
    c.header('Cache-Control','no-store')
    try { return c.json(await run()) } catch (error) {
      if (error instanceof MarketError) throw new AppError(error.kind === 'invalid' ? 'VALIDATION_ERROR' : error.kind === 'rate_limited' ? 'MARKET_RATE_LIMITED' : 'MARKET_DATA_UNAVAILABLE',error.message,error.kind === 'invalid' ? 400 : error.kind === 'rate_limited' ? 429 : 502)
      throw error
    }
  }
  search(c: Context) { return this.read(c,() => this.service.search(c.req.query('q') || '',c.req.raw.signal)) }
  quote(c: Context) { return this.read(c,() => this.service.quote(c.req.query('symbol') || '',c.req.raw.signal)) }
  quotes(c: Context) { return this.read(c,() => this.service.quotes((c.req.query('symbols') || '').split(','),c.req.raw.signal)) }
  chart(c: Context) { return this.read(c,() => this.service.getChart(c.req.query('symbol') || '',c.req.query('range') || '1mo',c.req.query('interval') || '1d',c.req.raw.signal)) }
  history(c: Context) { return this.read(c,() => this.service.history(c.req.query('symbol') || '',c.req.query('from') || '',c.req.query('to') || '',c.req.raw.signal,c.req.header('X-Client-Date'))) }
  fx(c: Context) { return this.read(c,() => this.service.fx(c.req.query('from') || '',c.req.query('to') || '',(c.req.query('currencies') || '').split(','),c.req.raw.signal,c.req.header('X-Client-Date'))) }
}
