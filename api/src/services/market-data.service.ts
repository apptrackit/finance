import { MarketReader } from '../../../shared/market-reader'
import { D1MarketCache } from '../../../shared/market-cache'
import { DAY, MarketError, dateRange } from '../../../shared/market-data'

export class MarketDataService extends MarketReader {
  constructor(db: D1Database) { super(new D1MarketCache(db)) }
  async getChart(symbol: string, range: string, interval: string, signal: AbortSignal) {
    // One daily series backs detail charts, sparklines and future portfolio reads.
    if (interval !== '1d') throw new MarketError('invalid','Only daily interval 1d is supported')
    const days: Record<string,number> = { '1d':1,'5d':5,'1mo':32,'6mo':184,'1y':366,'5y':1830,'max':3660 }
    if (!Object.hasOwn(days,range)) throw new MarketError('invalid','Unsupported chart range')
    const now = Date.now(), to = new Date(now).toISOString().slice(0,10)
    const from = new Date(now - days[range] * DAY).toISOString().slice(0,10)
    dateRange(from,to,now)
    const data = await this.history(symbol,from,to,signal)
    return {...data, quotes:data.points.map(p => ({...p,date:p.period_start}))}
  }
}
