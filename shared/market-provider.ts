import { DAY, MarketError, calendarDate, fiat, fxCoverage, isoDate, marketSymbol, missingQuote, positive, quoteFreshness, record } from './market-data'
import type { AssetCategory, CorporateAction, FxHistory, MarketBundle, PricePoint, SearchResult } from './market-data'

const MAX_BYTES = 1_048_576
const category = (type: unknown): AssetCategory | null => type === 'ETF' ? 'etf' : type === 'EQUITY' ? 'stock' : type === 'CRYPTOCURRENCY' ? 'crypto' : null
const text = (v: unknown): string | null => typeof v === 'string' && v.length <= 200 ? v : null
const seconds = (v: unknown, now: number): v is number => positive(v) && v * 1000 <= now + 60_000

// One bounded queue per Worker isolate, shared by all provider adapter instances.
let active = 0
const queue: (() => void)[] = []
async function slot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted()
  if (active >= 4) {
    if (queue.length >= 32) throw new MarketError('rate_limited', 'Market request queue is full')
    await new Promise<void>((resolve, reject) => {
      const ready = () => { signal.removeEventListener('abort', abort); resolve() }
      const abort = () => { const i = queue.indexOf(ready); if (i >= 0) queue.splice(i, 1); reject(signal.reason) }
      queue.push(ready)
      signal.addEventListener('abort', abort, { once: true })
    })
  } else active++
  if (signal.aborted) { if (queue.length) queue.shift()!(); else active--; signal.throwIfAborted() }
  return () => { if (queue.length) queue.shift()!(); else active-- }
}
async function pause(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
}
export async function providerJson(url: string, inputSignal: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const signal = AbortSignal.any([inputSignal, AbortSignal.timeout(18_000)])
  const release = await slot(signal)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted()
      const response = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal })
      if (!response.ok) {
        await response.body?.cancel()
        const retryAfter=response.headers.get('retry-after')
        const requestedWait=retryAfter ? /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-Date.now() : 0
        // Long provider cooldowns are returned to the caller, never retried early.
        if ((response.status === 429 || response.status >= 500) && attempt === 0 && !(requestedWait>1000)) { await pause(Math.max(200,requestedWait||0), signal); continue }
        throw new MarketError(response.status === 429 ? 'rate_limited' : [404, 422].includes(response.status) ? 'unsupported' : 'unavailable', 'Market provider request failed')
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new MarketError('unavailable', 'Market payload exceeds limit') }
      const reader = response.body?.getReader()
      if (!reader) throw new MarketError('unavailable', 'Empty provider response')
      const decoder = new TextDecoder()
      let bytes = 0, body = ''
      const abort = () => { void reader.cancel().catch(() => {}) }
      signal.addEventListener('abort',abort,{once:true})
      try {
        while (true) {
          signal.throwIfAborted()
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > MAX_BYTES) throw new MarketError('unavailable', 'Market payload exceeds limit')
          body += decoder.decode(chunk.value, { stream: true })
        }
        body += decoder.decode()
        signal.throwIfAborted()
        return JSON.parse(body)
      } finally { signal.removeEventListener('abort',abort);await reader.cancel().catch(() => {}); reader.releaseLock() }
    }
    throw new MarketError('unavailable', 'Market provider unavailable')
  } catch(error) {
    if(inputSignal.aborted) throw inputSignal.reason
    if(error instanceof MarketError) throw error
    throw new MarketError('unavailable','Market provider unavailable')
  } finally { release() }
}

export function normalizeYahoo(data: unknown, requestedSymbol: string, from: string, now: number): MarketBundle {
  if (!record(data) || !record(data.chart)) throw new MarketError('unavailable', 'Invalid market payload')
  if (data.chart.error) throw new MarketError('unsupported', 'Symbol is unavailable')
  const results = data.chart.result
  const result = Array.isArray(results) && results.length === 1 && record(results[0]) ? results[0] : null
  if (!result || !record(result.meta) || !record(result.indicators)) throw new MarketError('unavailable', 'Missing market series')
  const meta = result.meta, units = fiat(meta.currency), type = category(meta.instrumentType)
  if (typeof meta.symbol !== 'string' || marketSymbol(meta.symbol) !== requestedSymbol || !units || !type) throw new MarketError('unsupported', 'Unsupported symbol or quote units')
  const zone = text(meta.exchangeTimezoneName)
  if (!zone) throw new MarketError('unavailable', 'Missing exchange timezone')
  try { calendarDate(now, zone) } catch { throw new MarketError('unavailable', 'Invalid exchange timezone') }
  const today = calendarDate(now, zone), retrieved = new Date(now).toISOString()
  const timestamps = result.timestamp
  const bars = result.indicators.quote
  const close = Array.isArray(bars) && record(bars[0]) && Array.isArray(bars[0].close) ? bars[0].close : null
  if (!Array.isArray(timestamps) || timestamps.length > 3700 || !close || close.length !== timestamps.length) throw new MarketError('unavailable', 'Invalid daily series')
  const events: CorporateAction[] = []
  if (result.events !== undefined && !record(result.events)) throw new MarketError('unavailable', 'Invalid corporate events')
  const sourceEvents = record(result.events) ? result.events : {}
  for (const [kind, values] of Object.entries(sourceEvents)) {
    if (!['splits', 'dividends'].includes(kind)) throw new MarketError('unavailable', 'Unknown corporate event')
    if (!record(values) || Object.keys(values).length > 1000) throw new MarketError('unavailable', 'Invalid corporate events')
    for (const value of Object.values(values)) {
      if (!record(value) || !seconds(value.date, now)) throw new MarketError('unavailable', 'Invalid corporate event date')
      const date = calendarDate(value.date * 1000, zone)
      if (kind === 'splits') {
        if (!positive(value.numerator) || !positive(value.denominator)) throw new MarketError('unavailable', 'Invalid split ratio')
        const ratio = value.numerator / value.denominator
        if (!positive(ratio)) throw new MarketError('unavailable', 'Invalid split ratio')
        events.push({ date, type: 'split', ratio })
      } else events.push({ date, type: 'dividend' })
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date))
  const points: PricePoint[] = []
  let previous = 0
  for (let i = 0; i < timestamps.length; i++) {
    const ts: unknown = timestamps[i], price: unknown = close[i]
    if (!seconds(ts, now) || ts <= previous) throw new MarketError('unavailable', 'Invalid or unordered daily timestamps')
    previous = ts
    const date = calendarDate(ts * 1000, zone)
    if (price == null) continue // Preserve absent observations as gaps, never zero.
    if (!positive(price)) throw new MarketError('unavailable', 'Invalid daily close')
    // Yahoo chart close is split-adjusted (not dividend-adjusted). Undo every
    // later reported split through the retrieval date for contemporaneous units.
    const multiplier = events.filter(e => e.type === 'split' && e.date > date).reduce((p, e) => p * e.ratio!, 1)
    const raw = price * units.factor * multiplier
    if (!positive(raw)) throw new MarketError('unavailable', 'Invalid unadjusted close')
    if (date >= from && date <= today) points.push({ date, period_start: new Date(ts * 1000).toISOString(), close: raw,
      provider_close: price * units.factor, provisional: date === today })
  }
  if (new Set(points.map(p => p.date)).size !== points.length) throw new MarketError('unavailable', 'Duplicate daily bars')
  const quote = missingQuote(requestedSymbol, now)
  const asOf = seconds(meta.regularMarketTime, now) ? new Date(meta.regularMarketTime * 1000).toISOString() : null
  const sessionDate = asOf ? calendarDate(Date.parse(asOf), zone) : null
  let priorIndex = -1
  if (sessionDate) for (let i = 0; i < timestamps.length; i++) {
    if (calendarDate(timestamps[i] * 1000, zone) < sessionDate) priorIndex = i
  }
  const priorDate = priorIndex >= 0 ? calendarDate(timestamps[priorIndex] * 1000, zone) : null
  const priorPrice: unknown = close[priorIndex]
  const validPrior = positive(priorPrice) && positive(priorPrice*units.factor) && (type !== 'crypto' || (priorDate && sessionDate && Date.parse(sessionDate)-Date.parse(priorDate)===DAY))
  const period = record(meta.currentTradingPeriod) && record(meta.currentTradingPeriod.regular) ? meta.currentTradingPeriod.regular : null
  const regular = period && positive(period.start) && positive(period.end) && now >= period.start * 1000 && now <= period.end * 1000
  const candidatePrice = positive(meta.regularMarketPrice) && asOf ? meta.regularMarketPrice * units.factor : null
  const price = positive(candidatePrice) ? candidatePrice : null
  const session = type === 'crypto' ? 'continuous' : !period ? 'unknown' : regular ? 'regular' : 'closed'
  const normalized = quoteFreshness({ ...quote, category: type, currency: units.currency, exchange: text(meta.exchangeName), timezone: zone,
    price, regularMarketPrice: price, as_of: asOf, regularMarketTime: asOf ? Date.parse(asOf) / 1000 : null,
    previous_close: validPrior ? (priorPrice as number) * units.factor : null, previous_close_date: validPrior ? priorDate : null, session_date: sessionDate, session,
    session_start:period && positive(period.start)?new Date(period.start*1000).toISOString():null,
    session_end:period && positive(period.end)?new Date(period.end*1000).toISOString():null,
    status: price === null ? 'missing' : 'ok', reason: price === null ? 'missing_price' : null,
    shortName: text(meta.shortName) ?? text(meta.longName) ?? requestedSymbol,
    exchangeName: text(meta.exchangeName), quoteType: String(meta.instrumentType), marketState: regular ? 'REGULAR' : type === 'crypto' ? 'CONTINUOUS' : 'CLOSED' }, now)
  return { quote: normalized, history: { symbol: requestedSymbol, provider: 'yahoo', category:type, currency: units.currency,
    exchange: text(meta.exchangeName), timezone: zone, from, to: [new Date(now).toISOString().slice(0,10),today].sort().at(-1)!, retrieved_at: retrieved,
    status: points.length ? 'ok' : 'missing', reason: points.length ? null : 'missing_price', price_kind: 'unadjusted', points,
    events, requires_event_review: events.length > 0 } }
}

export class MarketProvider {
  private readonly fetcher: typeof fetch
  constructor(fetcher: typeof fetch = fetch) { this.fetcher=fetcher }
  async series(symbol: string, from: string, now: number, signal: AbortSignal) {
    const query = new URLSearchParams({ interval: '1d', period1: String(Math.floor(Date.parse(from) / 1000) - DAY / 1000),
      period2: String(Math.floor(now / 1000)), events: 'splits,div', includeAdjustedClose: 'false' })
    const data = await providerJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, signal, this.fetcher)
    try { return normalizeYahoo(data,symbol,from,now) } catch (error) {
      // Bad historical bars/events cannot invalidate independently valid current
      // metadata. Withhold previous-close moves and all unusable history.
      const result = record(data) && record(data.chart) && Array.isArray(data.chart.result) ? data.chart.result[0] : null
      if (!(error instanceof MarketError) || error.kind !== 'unavailable' || !record(result) || !record(result.meta)) throw error
      const safe = normalizeYahoo({chart:{result:[{meta:result.meta,timestamp:[],indicators:{quote:[{close:[]}]},events:{}}]}},symbol,from,now)
      safe.history.reason='invalid_history'
      return safe
    }
  }
  async search(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const data = await providerJson(`https://query2.finance.yahoo.com/v1/finance/search?${new URLSearchParams({ q: query, quotesCount: '10', newsCount: '0', enableFuzzyQuery: 'false' })}`, signal, this.fetcher)
    if (!record(data) || !Array.isArray(data.quotes) || data.quotes.length > 100) throw new MarketError('unavailable', 'Invalid search response')
    const rows: SearchResult[] = []
    for (const q of data.quotes) {
      if (!record(q) || !category(q.quoteType) || typeof q.symbol !== 'string') continue
      try { rows.push({ symbol: marketSymbol(q.symbol), category: category(q.quoteType)!,
        quoteType: q.quoteType as SearchResult['quoteType'], shortname: text(q.shortname) ?? q.symbol,
        longname: text(q.longname) ?? text(q.shortname) ?? q.symbol, exchange: text(q.exchange) }) } catch { /* unsupported identifiers are not offered */ }
    }
    return [...new Map(rows.map(r => [r.symbol, r])).values()].slice(0, 10)
  }
  async fx(from: string, to: string, currencies: string[], now: number, signal: AbortSignal): Promise<FxHistory> {
    const query = new URLSearchParams({ base: 'EUR', quotes: currencies.filter(c => c !== 'EUR').join(','),
      from: new Date(Date.parse(from) - 4 * DAY).toISOString().slice(0, 10), to })
    const data = currencies.every(c => c === 'EUR') ? [] : await providerJson(`https://api.frankfurter.dev/v2/providers/ecb/rates?${query}`, signal, this.fetcher)
    if (!Array.isArray(data) || data.length > 4000) throw new MarketError('unavailable', 'Invalid historical FX series')
    const dates = new Map<string, Record<string, number>>()
    for (const row of data) {
      if (!record(row) || !isoDate(row.date) || row.date < query.get('from')! || row.date > to || row.base !== 'EUR'
        || typeof row.quote !== 'string' || !currencies.includes(row.quote) || !positive(row.rate)) throw new MarketError('unavailable', 'Invalid dated FX observation')
      const rates = dates.get(row.date) ?? { EUR: 1 }
      if (rates[row.quote] !== undefined && row.quote !== 'EUR') throw new MarketError('unavailable', 'Duplicate FX observation')
      rates[row.quote] = row.rate
      dates.set(row.date, rates)
    }
    return fxCoverage({ provider: 'frankfurter_ecb', source: 'ECB statistics', base: 'EUR', from, to, currencies,
      retrieved_at: new Date(now).toISOString(), status: data.length || currencies.every(c => c === 'EUR') ? 'ok' : 'missing',
      reason: data.length || currencies.every(c => c === 'EUR') ? null : 'missing_fx',
      points: [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, rates]) => ({ date, rates })) })
  }
}
