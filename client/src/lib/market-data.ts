import { API_BASE_URL, apiFetch } from '../config'
import type { Quote } from '../../../shared/market-data'
export type ClientQuote = Partial<Quote> & { symbol: string }
type Read = { controller: AbortController; promise: Promise<ClientQuote>; users: number }
const active = new Map<string,Read>()
const lastGood = new Map<string,{quote:ClientQuote; savedAt:number}>()
const valid = (value: unknown): value is Partial<Quote> => typeof value === 'object' && value !== null
  && 'regularMarketPrice' in value && (value.regularMarketPrice === null || (typeof value.regularMarketPrice === 'number' && Number.isFinite(value.regularMarketPrice) && value.regularMarketPrice > 0))
  && (!('currency' in value) || value.currency == null || (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)))
  && (!('as_of' in value) || value.as_of == null || (typeof value.as_of === 'string' && Number.isFinite(Date.parse(value.as_of))))

function quote(symbol: string, signal: AbortSignal): Promise<ClientQuote> {
  signal.throwIfAborted()
  const saved = lastGood.get(symbol)
  let flight = active.get(symbol)
  if (!flight || flight.controller.signal.aborted) {
    const controller = new AbortController()
    flight = {controller,users:0,promise:Promise.resolve().then(async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`,{throwOnError:true,signal:controller.signal})
        const data: unknown = await response.json()
        controller.signal.throwIfAborted()
        if (!valid(data)) throw new Error('Invalid market quote')
        if (data.regularMarketPrice === null && saved) throw new Error('Quote unavailable')
        const result = {...data,symbol:data.symbol||symbol}
        if (typeof result.regularMarketPrice === 'number') {
          lastGood.set(symbol,{quote:result,savedAt:Date.now()})
          if (lastGood.size > 200) lastGood.delete(lastGood.keys().next().value!)
        }
        return result
      } catch (error) {
        controller.signal.throwIfAborted()
        // Preserve its source timestamp, but never keep its old Today change.
        if (saved && Date.now()-saved.savedAt < 7*86_400_000) return {...saved.quote,status:'stale' as const,reason:'provider_unavailable',change:null,change_percent:null,regularMarketChange:null,regularMarketChangePercent:null}
        throw error
      }
    })}
    const item=flight
    active.set(symbol,item)
    void item.promise.finally(() => {if(active.get(symbol)===item) active.delete(symbol)}).catch(()=>{})
  }
  const item=flight
  item.users++
  let abort: () => void = () => {}
  return new Promise<ClientQuote>((resolve,reject)=>{
    abort=()=>reject(signal.reason)
    signal.addEventListener('abort',abort,{once:true})
    item.promise.then(resolve,reject)
    if(signal.aborted) abort()
  }).finally(()=>{signal.removeEventListener('abort',abort);if(--item.users===0) item.controller.abort()})
}
/** Shared session-only quote reads; bounded fan-out and independently cancellable
 * callers. Never persist financial snapshots in local/session storage. */
export async function readMarketQuotes(inputs: string[], signal = new AbortController().signal): Promise<Record<string,ClientQuote>> {
  const symbols=[...new Set(inputs)]
  if(symbols.length>200) throw new Error('At most 200 market symbols per view')
  const rows: [string,ClientQuote][]=[]
  let next=0
  await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{
    while(next<symbols.length){
      signal.throwIfAborted()
      const symbol=symbols[next++]
      try {rows.push([symbol,await quote(symbol,signal)])} catch {signal.throwIfAborted()}
    }
  }))
  signal.throwIfAborted()
  return Object.fromEntries(rows)
}
export function clearMarketReadCache() { lastGood.clear() }
