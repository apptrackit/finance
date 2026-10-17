import { DAY, MarketError, dateRange, fxCoverage, marketSymbol, missingQuote, quoteFreshness } from './market-data'
import type { FxHistory, MarketBundle, PriceHistory, Quote, SearchResult } from './market-data'
import type { MarketCache } from './market-cache'
import { MarketProvider } from './market-provider'

type Flight = { controller: AbortController; promise: Promise<unknown>; users: number }
const flights = new WeakMap<object, Map<string, Flight>>()
async function shared<T>(scope: object, key: string, signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  let map = flights.get(scope)
  if (!map) { map = new Map(); flights.set(scope,map) }
  let flight = map.get(key)
  if (!flight || flight.controller.signal.aborted) {
    const controller = new AbortController()
    flight = { controller, promise: Promise.resolve().then(() => run(controller.signal)), users: 0 }
    const item = flight
    map.set(key, item)
    void item.promise.finally(() => { if (map!.get(key) === item) map!.delete(key) }).catch(() => {})
  }
  flight.users++
  const item = flight
  let abort: () => void = () => {}
  return new Promise<T>((resolve,reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort',abort,{once:true})
    item.promise.then(v => resolve(v as T),reject)
    if (signal.aborted) abort()
  }).finally(() => { // Each caller owns cancellation; the last one stops the provider.
    signal.removeEventListener('abort',abort)
    item.users--
    if (!item.users) item.controller.abort()
  })
}
const quiet = async (write: Promise<unknown>) => { try { await write } catch { /* A disposable-cache failure cannot destroy a valid provider read. */ } }
export class MarketReader {
  constructor(private readonly cache: MarketCache, private readonly provider = new MarketProvider(), private readonly clock = () => Date.now()) {}
  private async cached<T>(key: string) { try { return await this.cache.get<T>(key) } catch { return null } }
  async quote(input: string, signal = new AbortController().signal): Promise<Quote> {
    const symbol = marketSymbol(input)
    return shared(this.cache.scope,`quote:${symbol}`,signal,async abort => {
      const now = this.clock(), key = `quote:v1:${symbol}`
      const saved = await this.cached<Quote>(key)
      if (saved && saved.expires_at > now) return quoteFreshness(saved.data,now)
      try {
        const from = new Date(now - 32 * DAY).toISOString().slice(0,10)
        const bundle = await this.provider.series(symbol,from,now,abort)
        abort.throwIfAborted()
        if (bundle.quote.price === null) throw new MarketError('unavailable','Missing quote')
        if (saved?.data.as_of && bundle.quote.as_of && bundle.quote.as_of < saved.data.as_of) throw new MarketError('unavailable','Regressed quote timestamp')
        await quiet(this.cache.put(key,bundle.quote,now,5*60_000,7*DAY))
        const history = await this.cached<MarketBundle>(`history:v1:${symbol}`)
        if (bundle.history.points.length && (!history || history.data.history.from >= from)) await quiet(this.cache.put(`history:v1:${symbol}`,bundle,now,15*60_000,30*DAY))
        return bundle.quote
      } catch (error) {
        abort.throwIfAborted()
        if (saved && saved.data.price !== null && saved.stale_until > now) {
          const fallback = quoteFreshness(saved.data,now,true)
          await quiet(this.cache.put(key,fallback,now,Math.min(30_000,saved.stale_until-now),saved.stale_until-now))
          return fallback
        }
        const missing = missingQuote(symbol,now,error instanceof MarketError && error.kind === 'unsupported')
        if(error instanceof MarketError && error.kind==='rate_limited') missing.reason='rate_limited'
        await quiet(this.cache.put(key,missing,now,60_000,60_000))
        return missing
      }
    })
  }
  async quotes(inputs: string[], signal = new AbortController().signal): Promise<Record<string,Quote>> {
    if (inputs.length > 50) throw new MarketError('invalid','At most 50 symbols per request')
    const symbols = [...new Set(inputs.map(marketSymbol))]
    // Bound fan-out before entering the provider queue; callers can chunk >50.
    let next = 0
    const entries: [string,Quote][] = []
    await Promise.all(Array.from({length:Math.min(4,symbols.length)},async () => {
      while (next < symbols.length) { signal.throwIfAborted(); const symbol = symbols[next++]; entries.push([symbol,await this.quote(symbol,signal)]) }
    }))
    return Object.fromEntries(entries)
  }
  async history(input: string, from: string, to: string, signal = new AbortController().signal, clientDate?: string): Promise<PriceHistory> {
    const symbol = marketSymbol(input), now = this.clock()
    dateRange(from,to,now,3660,clientDate)
    // Serialise overlapping ranges per symbol. A short waiter retries coverage
    // after a joined narrower request instead of labelling it complete.
    const load = async (abort: AbortSignal): Promise<MarketBundle> => {
      const key = `history:v1:${symbol}`, saved = await this.cached<MarketBundle>(key)
      const covers = saved && saved.data.history.from <= from && saved.data.history.to >= to
      if (covers && saved.expires_at > now) return saved.data
      try {
        const start = saved && saved.data.history.from < from ? saved.data.history.from : from
        const bundle = await this.provider.series(symbol,start,now,abort)
        abort.throwIfAborted()
        if (!bundle.history.points.length) throw new MarketError('unavailable','No daily closes')
        await quiet(this.cache.put(key,bundle,now,15*60_000,30*DAY))
        const priorQuote=await this.cached<Quote>(`quote:v1:${symbol}`)
        if (bundle.quote.price !== null && (!priorQuote?.data.as_of || (bundle.quote.as_of && bundle.quote.as_of>=priorQuote.data.as_of))) await quiet(this.cache.put(`quote:v1:${symbol}`,bundle.quote,now,5*60_000,7*DAY))
        return bundle
      } catch (error) {
        abort.throwIfAborted()
        if (covers && saved.stale_until > now) return {...saved.data,history:{...saved.data.history,status:'stale',reason:'provider_unavailable'}}
        throw error
      }
    }
    let bundle = await shared(this.cache.scope,`history:${symbol}`,signal,load)
    if (bundle.history.from > from || bundle.history.to < to) bundle = await shared(this.cache.scope,`history:${symbol}`,signal,load)
    return {...bundle.history,from,to,points:bundle.history.points.filter(p => p.date >= from && p.date <= to),
      events:bundle.history.events.filter(e => e.date >= from && e.date <= to),
      requires_event_review:bundle.history.events.some(e => e.date >= from && e.date <= to)}
  }
  async search(input: string, signal = new AbortController().signal): Promise<{quotes:SearchResult[]}> {
    const query = input.trim()
    if (!query || query.length > 80 || /[\x00-\x1f]/.test(query)) throw new MarketError('invalid','Search must contain 1–80 characters')
    const key = `search:v1:${query.toUpperCase()}`
    return shared(this.cache.scope,key,signal,async abort => {
      const now = this.clock(), saved = await this.cached<SearchResult[]>(key)
      if (saved && saved.expires_at > now) return {quotes:saved.data}
      const rows = await this.provider.search(query,abort)
      abort.throwIfAborted()
      await quiet(this.cache.put(key,rows,now,DAY,DAY))
      return {quotes:rows}
    })
  }
  async fx(from: string, to: string, input: string[], signal = new AbortController().signal, clientDate?: string): Promise<FxHistory> {
    const now = this.clock()
    dateRange(from,to,now,366,clientDate)
    if (!input.length || input.length > 10 || input.some(c => !/^[A-Z]{3}$/.test(c))) throw new MarketError('invalid','Use 1–10 ISO fiat codes')
    const currencies = [...new Set(input)].sort(), key = `fx:v1:${from}:${to}:${currencies.join(',')}`
    return shared(this.cache.scope,key,signal,async abort => {
      const saved = await this.cached<FxHistory>(key)
      if (saved && saved.expires_at > now) return saved.data
      try {
        const data = await this.provider.fx(from,to,currencies,now,abort)
        abort.throwIfAborted()
        if (data.status === 'missing') throw new MarketError('unavailable','Historical FX unavailable')
        await quiet(this.cache.put(key,data,now,6*3_600_000,30*DAY))
        return data
      } catch {
        abort.throwIfAborted()
        if (saved && saved.stale_until > now) return {...saved.data,status:'stale',reason:'provider_unavailable'}
        return fxCoverage({provider:'frankfurter_ecb',source:'ECB statistics',base:'EUR',from,to,currencies,
          retrieved_at:new Date(now).toISOString(),status:'missing',reason:'missing_fx',points:[]})
      }
    })
  }
}
