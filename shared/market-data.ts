/** Provider-neutral market inputs. Null is unavailable, never a zero quote. */
export type MarketStatus = 'ok' | 'last_close' | 'stale' | 'missing' | 'unsupported'
export type AssetCategory = 'etf' | 'stock' | 'crypto'
export type Quote = {
  symbol: string; provider: 'yahoo'; category: AssetCategory | null
  currency: string | null; exchange: string | null; timezone: string | null
  price: number | null; previous_close: number | null; previous_close_date: string | null
  previous_close_kind: 'split_adjusted_to_quote'
  as_of: string | null; session_date: string | null; retrieved_at: string
  session: 'regular' | 'closed' | 'continuous' | 'unknown'; status: MarketStatus
  session_start: string | null; session_end: string | null
  change: number | null; change_percent: number | null; reason: string | null
  shortName?: string; regularMarketPrice: number | null; regularMarketTime: number | null
  regularMarketChange: number | null; regularMarketChangePercent: number | null
  exchangeName: string | null; quoteType: string | null; marketState: string
}
export type PricePoint = {
  date: string; period_start: string; close: number; provider_close: number
  provisional: boolean
}
export type CorporateAction = { date: string; type: 'split' | 'dividend'; ratio?: number }
export type PriceHistory = {
  symbol: string; provider: 'yahoo'; category: AssetCategory; currency: string; exchange: string | null; timezone: string
  from: string; to: string; retrieved_at: string; status: MarketStatus; reason: string | null
  price_kind: 'unadjusted'; points: PricePoint[]; events: CorporateAction[]
  // Unsupported unit/cash corporate actions must be reviewed before portfolio returns.
  requires_event_review: boolean
}
export type MarketBundle = { quote: Quote; history: PriceHistory }
export type SearchResult = {
  symbol: string; shortname: string; longname: string; exchange: string | null
  quoteType: 'ETF' | 'EQUITY' | 'CRYPTOCURRENCY'; category: AssetCategory
}
export type FxPoint = { date: string; rates: Record<string, number> }
export type FxHistory = {
  provider: 'frankfurter_ecb'; source: 'ECB statistics'; base: 'EUR'
  from: string; to: string; currencies: string[]; retrieved_at: string
  status: 'ok' | 'stale' | 'missing'; reason: string | null; points: FxPoint[]
  coverage?: 'complete' | 'partial' | 'missing'; missing?: {date: string; currencies: string[]}[]
}
export class MarketError extends Error {
  readonly kind: 'invalid' | 'unsupported' | 'rate_limited' | 'unavailable'
  constructor(kind: MarketError['kind'], message: string) { super(message); this.kind = kind }
}
export const DAY = 86_400_000
export const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
export const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
export function marketSymbol(value: string): string {
  const symbol = value.trim().toUpperCase()
  if (!/^[A-Z0-9^][A-Z0-9.^=\-]{0,39}$/.test(symbol)) throw new MarketError('invalid', 'Invalid market symbol')
  return symbol
}
export function calendarDate(time: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function dateRange(from: string, to: string, now = Date.now(), maxDays = 3660, clientDate?: string): void {
  const utcDay = new Date(now).toISOString().slice(0,10)
  const today = isoDate(clientDate) && Math.abs(Date.parse(clientDate)-Date.parse(utcDay))<=DAY ? clientDate : utcDay
  if (!isoDate(from) || !isoDate(to) || from > to || to > today
    || Date.parse(to) - Date.parse(from) > maxDays * DAY || Date.parse(from) < now - 3661 * DAY) {
    throw new MarketError('invalid', `Use real, nonfuture dates within the last 10 years; maximum range ${maxDays} days`)
  }
}
export function fiat(value: unknown): { currency: string; factor: number } | null {
  if (value === 'GBp' || value === 'GBX') return { currency: 'GBP', factor: 0.01 }
  if (value === 'ZAc') return { currency: 'ZAR', factor: 0.01 }
  if (value === 'ILA') return { currency: 'ILS', factor: 0.01 }
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? { currency: value, factor: 1 } : null
}
export function quoteFreshness(quote: Quote, now = Date.now(), fallback = false): Quote {
  const age = quote.as_of ? now - Date.parse(quote.as_of) : Infinity
  const today = quote.timezone ? calendarDate(now, quote.timezone) : null
  const sameDay = quote.session_date === today
  const session = quote.category === 'crypto' ? 'continuous' : quote.session_start && quote.session_end
    ? now>=Date.parse(quote.session_start) && now<=Date.parse(quote.session_end) ? 'regular' : 'closed' : 'unknown'
  const stale = fallback || quote.status === 'stale' || age > (quote.category === 'crypto' || (sameDay && session === 'regular') ? 20 * 60_000 : 96 * 3_600_000)
  const status: MarketStatus = quote.price === null ? quote.status : stale ? 'stale' : sameDay ? 'ok' : 'last_close'
  const canMove = status === 'ok' && positive(quote.previous_close) && quote.price !== null
    && quote.previous_close_date !== null && quote.previous_close_date < (quote.session_date || '')
  const change = canMove ? quote.price! - quote.previous_close! : null
  const rawPercent = change === null ? null : change / quote.previous_close! * 100
  const percent = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null
  return { ...quote, session, marketState:session==='regular'?'REGULAR':session==='continuous'?'CONTINUOUS':session==='closed'?'CLOSED':'UNKNOWN', status, change, change_percent: percent, regularMarketChange: change,
    regularMarketChangePercent: percent, reason: status === 'stale' ? 'stale_price' : status === 'last_close' ? 'previous_session_close' : quote.reason }
}
export function missingQuote(symbol: string, now: number, unsupported = false): Quote {
  return { symbol, provider: 'yahoo', category: null, currency: null, exchange: null, timezone: null, price: null,
    previous_close: null, previous_close_date: null, as_of: null, session_date: null,
    previous_close_kind: 'split_adjusted_to_quote',
    retrieved_at: new Date(now).toISOString(), session: 'unknown', session_start:null, session_end:null, status: unsupported ? 'unsupported' : 'missing',
    change: null, change_percent: null, reason: unsupported ? 'unsupported_symbol' : 'missing_price',
    regularMarketPrice: null, regularMarketTime: null, regularMarketChange: null, regularMarketChangePercent: null,
    exchangeName: null, quoteType: null, marketState: 'UNKNOWN' }
}
/** No backward fill or bridging an unexplained publication gap. Weekend/holiday
 * carry is explicit, bounded to four days, and keeps the actual observation date. */
export function targetClosed(date: string): boolean {
  const day = new Date(date), year = day.getUTCFullYear(), monthDay = date.slice(5)
  if ([0,6].includes(day.getUTCDay()) || ['01-01','05-01','12-25','12-26'].includes(monthDay)) return true
  // Gregorian Easter (Meeus), for TARGET Good Friday and Easter Monday.
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25)
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7
  const m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),easterDay=(h+l-7*m+114)%31+1
  const easter=Date.UTC(year,month-1,easterDay),ts=Date.parse(date)
  return ts===easter-2*DAY || ts===easter+DAY
}
export function datedFxAt(history: FxHistory, date: string, currency: string) {
  if (!isoDate(date) || date < history.from || date > history.to) return { rate: null, as_of: null, reason: 'outside_coverage' }
  if (currency === 'EUR') return { rate: 1, as_of: date, reason: null }
  const point = history.points.filter(p => p.date <= date && positive(p.rates[currency])).at(-1)
  if (!point || Date.parse(date) - Date.parse(point.date) > 4 * DAY) return { rate: null, as_of: point?.date ?? null, reason: 'missing_fx' }
  for (let ts=Date.parse(point.date)+DAY;ts<=Date.parse(date);ts+=DAY) {
    if (!targetClosed(new Date(ts).toISOString().slice(0,10))) return {rate:null,as_of:point.date,reason:'missing_fx'}
  }
  return { rate: point.rates[currency], as_of: point.date, reason: history.status === 'stale' ? 'stale_fx' : null }
}
export function fxCoverage(history: FxHistory): FxHistory {
  const missing: {date:string;currencies:string[]}[]=[]
  let known=0,total=0
  for(let ts=Date.parse(history.from);ts<=Date.parse(history.to);ts+=DAY){
    const date=new Date(ts).toISOString().slice(0,10)
    const currencies=history.currencies.filter(c=>datedFxAt(history,date,c).rate===null)
    total+=history.currencies.length;known+=history.currencies.length-currencies.length
    if(currencies.length) missing.push({date,currencies})
  }
  return {...history,coverage:known===total?'complete':known?'partial':'missing',missing}
}
/** Exact daily observations or confirmed weekend carry only. We do not own a
 * complete exchange holiday calendar; absent weekdays stay missing. */
export function dailyPriceAt(history: PriceHistory, date: string) {
  if(!isoDate(date)||date<history.from||date>history.to) return {price:null,as_of:null,reason:'outside_coverage'}
  const point=history.points.filter(p=>p.date<=date).at(-1)
  if(!point) return {price:null,as_of:null,reason:'missing_price'}
  if(point.date!==date) {
    if(history.category==='crypto') return {price:null,as_of:point.date,reason:'missing_price'}
    for(let ts=Date.parse(point.date)+DAY;ts<=Date.parse(date);ts+=DAY) if(![0,6].includes(new Date(ts).getUTCDay())) return {price:null,as_of:point.date,reason:'missing_price'}
  }
  return {price:point.close,as_of:point.date,reason:history.status==='stale'?'stale_price':point.provisional?'provisional':null}
}
