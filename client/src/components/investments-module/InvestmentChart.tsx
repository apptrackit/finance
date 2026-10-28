import type { ReactNode } from 'react'
import type { MarketQuote } from './types'
import { holdingSourceTime } from './holding-presentation'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useCalendarAxis } from '../common/calendar-axis'
import type { PriceHistory } from '../../../../shared/market-data'
import { API_BASE_URL, apiFetch } from '../../config'
import { unitPrice } from './overview'
import { Select } from '../common/select'
type Trade = {
  id: string
  date: string
  amount: number
  quantity?: number
  price?: number
  execution_currency?: string | null
}
export type HoldingChartCache = Map<string, PriceHistory>
const RANGES = [
  ['1d', '1D'],
  ['5d', '5D'],
  ['1mo', '1M'],
  ['6mo', '6M'],
  ['1y', '1Y'],
  ['5y', '5Y'],
  ['max', '10Y'],
] as const
export function chartTrades(history: PriceHistory, transactions: Trade[]) {
  return transactions
    .filter((t) => t.date >= history.from && t.date <= history.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
/** Presentation only: recorded fills retain their original price and units. */
export function splitAdjustedTradePrice(trade:Pick<Trade,'date'|'price'>,history:PriceHistory):number|null {
  if(trade.price==null||!Number.isFinite(trade.price)||trade.price<=0)return null
  let factor=1
  for(const event of history.events)if(event.type==='split'&&event.date>trade.date){
    if(event.ratio==null||!Number.isFinite(event.ratio)||event.ratio<=0)return null
    factor*=event.ratio
  }
  const price=trade.price/factor
  return Number.isFinite(factor)&&factor>0&&Number.isFinite(price)&&price>0?price:null
}
export function InvestmentChart({
  symbol,
  transactions = [],
  averageCost,
  costCurrency,
  cache,
  revisionKey = '',
  quote,
  children,
}: {
  symbol: string
  transactions?: Trade[]
  averageCost?: number | null
  costCurrency?: string
  cache?: HoldingChartCache
  revisionKey?: string
  quote?: MarketQuote
  children?: ReactNode
}) {
  const [localCache] = useState<HoldingChartCache>(() => new Map())
  const store = cache ?? localCache
  const [range, setRange] = useState('1mo'),
    [retry, setRetry] = useState(0)
  const key = `${revisionKey}:${symbol}:${range}`
  const [snapshot, setSnapshot] = useState<{ key: string; value: PriceHistory } | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [selected, setSelected] = useState<{ key: string; date: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController(),
      saved = store.get(key)
    if (saved && retry === 0) {
      setSnapshot({ key, value: saved })
      setLoading(false)
      setError(null)
      return () => controller.abort()
    }
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/market/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`,
          { throwOnError: true, signal: controller.signal },
        )
        const value = (await response.json()) as PriceHistory
        if (
          !value ||
          value.symbol !== symbol.toUpperCase() ||
          !Array.isArray(value.points) ||
          !Array.isArray(value.events) ||
          !Number.isFinite(Date.parse(value.from)) ||
          !Number.isFinite(Date.parse(value.to)) ||
          !value.currency ||
          value.points.some(
            (p) => !Number.isFinite(p.close) || p.close <= 0 || !Number.isFinite(p.provider_close) || p.provider_close<=0 || !/^\d{4}-\d{2}-\d{2}$/.test(p.date),
          )
        )
          throw new Error('Invalid price history')
        if (!controller.signal.aborted) {
          store.delete(key)
          store.set(key, value)
          while (store.size > 12) store.delete(store.keys().next().value!)
          setSnapshot({ key, value })
        }
      } catch {
        if (!controller.signal.aborted) setError('Price history could not be refreshed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [key, symbol, range, retry, store])
  const history = snapshot?.key === key ? snapshot.value : (store.get(key) ?? null)
  const trades = useMemo(() => (history ? chartTrades(history, transactions) : []), [history, transactions])
  const points = useMemo(() => {
    const display=history?.points.map(p=>({...p,close:p.provider_close,time:Date.parse(`${p.date}T00:00:00Z`)}))??[]
    const price=quote?.price??quote?.regularMarketPrice,time=Date.parse(quote?.as_of??'')
    if(!history||!quote||quote.symbol.toUpperCase()!==symbol.toUpperCase()||quote.currency!==history.currency||price==null||!Number.isFinite(price)||price<=0||!Number.isFinite(time)||quote.status==='missing'||quote.status==='unsupported'||quote.status==='stale')return display
    try {
      const date=quote.session_date??new Intl.DateTimeFormat('sv-SE',{timeZone:quote.timezone??history.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time))
      const last=display.at(-1)
      if(!last||date<last.date||date<history.from||date>history.to||time<Date.parse(last.period_start))return display
      const endpoint={...last,date,period_start:quote.as_of!,close:price,provider_close:price,time:Date.parse(`${date}T00:00:00Z`),provisional:quote.session!=='closed'}
      if(date===last.date)display[display.length-1]=endpoint
      else display.push(endpoint)
    }catch{/* A source without valid session timing cannot extend the chart. */}
    return display
  },[history,quote,symbol])
  const markers = useMemo(() => {
    // Date-only markers sit in a separate bottom lane, never at an inferred fill.
    const lowest = Math.min(...points.map(p => p.close))
    const highest = Math.max(...points.map(p => p.close))
    const lane = Math.max(0, lowest - Math.max((highest - lowest) * 0.12, lowest * 0.03))
    return trades.map(t => {
      const adjusted=history&&t.execution_currency===history.currency?splitAdjustedTradePrice(t,history):null
      return {...t, time: Date.parse(`${t.date}T00:00:00Z`), markerPrice: adjusted ?? lane, dateOnly: adjusted==null}
    })
  }, [trades, points, history?.currency])
  const buys = markers.filter((t) => (t.quantity ?? t.amount) > 0)
  const sells = markers.filter((t) => (t.quantity ?? t.amount) < 0)
  const dates = [...new Set([...points.map((p) => p.date), ...trades.map((t) => t.date)])].sort()
  const first = points.at(0),last = points.at(-1)
  const change = first && last ? last.close - first.close : null,
    rawPercent = change !== null && first ? (change / first.close) * 100 : null
  const percent = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null
  const money = (n: number | null | undefined) => n==null?'Unavailable':Math.abs(n)>=1||Math.abs(last?.close??0)>=1?`${n.toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2})} ${history?.currency??''}`:unitPrice(n,history?.currency??'')
  const date = selected?.key === key ? selected.date : last?.date
  const dayTrades = trades.filter((t) => t.date === date),
    close = points.find((p) => p.date === date)?.close
  const tradeText = (t: Trade) =>
    `${(t.quantity ?? t.amount) > 0 ? 'Buy' : 'Sell'} · ${Math.abs(t.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 12 })} units · ${unitPrice(t.price, t.execution_currency ?? 'unverified currency')} · ${t.date}`
  const updatedAt=quote?.as_of&&last?.period_start===quote.as_of?quote.as_of:history?.retrieved_at
  const currentCost = averageCost != null && costCurrency === history?.currency ? averageCost : null
  const domain = [
    Math.min(...points.map((p) => p.time), ...markers.map((t) => t.time)),
    Math.max(...points.map((p) => p.time), ...markers.map((t) => t.time)),
  ]
  const { ref: axisRef, axisProps } = useCalendarAxis(points.length ? domain[0] : undefined, points.length ? domain[1] : undefined, { plotInset: 12 })
  return (
    <section aria-label="Instrument price history" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-medium text-muted-foreground">Price</h3>
          <p className="mt-1 text-lg font-semibold tabular-nums">{close!=null?money(close):date?'Daily close unavailable':'Price unavailable'}</p>
          {/* Keep both captions in the same grid cell so wrapped range text reserves
              its height while the selected date is visible. */}
          <div className="mt-0.5 grid min-h-4 text-xs leading-4">
            <p aria-hidden={selected?.key!==key} className={`col-start-1 row-start-1 text-muted-foreground ${selected?.key===key?'':'invisible'}`}>{holdingSourceTime(date)?.short??date}</p>
            <p aria-hidden={selected?.key===key} className={`col-start-1 row-start-1 font-medium tabular-nums ${selected?.key===key?'invisible ':''}${change===0?'text-muted-foreground':change!=null&&change>0?'text-success':'text-destructive'}`}>
              {change!=null&&percent!=null&&<>{change>0?'+':''}{money(change)} ({percent>0?'+':''}{percent.toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2})}%) · {{'1d':'past day','5d':'past 5 days','1mo':'past month','6mo':'past 6 months','1y':'past year','5y':'past 5 years','max':'past 10 years'}[range]}</>}
            </p>
          </div>
        </div>
        <div role="group" aria-label="Instrument chart range" className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-background p-0.5">
          {RANGES.map(([value,label])=><button type="button" key={value} aria-pressed={range===value} onClick={()=>setRange(value)} className={`min-h-8 rounded-md px-2 text-[11px] font-semibold ${range===value?'bg-secondary':'text-muted-foreground'}`}>{label}</button>)}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}{' '}
          <button
            type="button"
            className="min-h-10 text-primary underline"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          {history ? 'Refreshing price history…' : 'Loading price history…'}
        </p>
      )}
      <div ref={axisRef} className="h-[200px] w-full" aria-label="Daily instrument price history">
        {!points.length ? (
          <p className="p-4 text-xs text-muted-foreground">
            {loading ? 'Loading daily observations…' : 'No known daily closes in this range.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              onMouseMove={(s) => {
                const time = Number(s.activeLabel)
                if (
                  s.activeLabel != null &&
                  Number.isFinite(time) &&
                  time >= Date.parse(history!.from) &&
                  time <= Date.parse(history!.to)
                )
                  setSelected({ key, date: new Date(time).toISOString().slice(0, 10) })
              }}
              onClick={(s) => {
                const time = Number(s.activeLabel)
                if (
                  s.activeLabel != null &&
                  Number.isFinite(time) &&
                  time >= Date.parse(history!.from) &&
                  time <= Date.parse(history!.to)
                )
                  setSelected({ key, date: new Date(time).toISOString().slice(0, 10) })
              }}
              onMouseLeave={() => setSelected(null)}
              margin={{ left: 6, right: 6, top: 8, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                type="number"
                domain={domain}
                scale="time"
                {...axisProps}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                hide
                width={0}
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
                tickFormatter={(n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: Math.abs(Number(n))>=1?2:12 })}
              />
              <Tooltip
                filterNull={false}
                content={({ active, payload }) => {
                  const p = (active ? payload?.[0]?.payload : undefined) as
                    { date?: string; close?: number; time?: number; dateOnly?: boolean; markerPrice?:number } | undefined
                  const d = p?.date ?? (p?.time ? new Date(p.time).toISOString().slice(0, 10) : null)
                  return d ? (
                    <div className="max-w-64 rounded-lg border border-border bg-card p-3 text-xs shadow-lg">
                      <p>{d}</p>
                      {p?.dateOnly && <p className="text-muted-foreground">Date only · execution price unavailable in chart currency</p>}
                      {p?.close != null && <p>Split-adjusted close: {money(p.close)}</p>}
                      {p?.markerPrice!=null&&!p.dateOnly&&<p>Split-adjusted execution: {money(p.markerPrice)}</p>}
                      {trades
                        .filter((t) => t.date === d)
                        .map((t) => (
                          <p key={t.id}>{tradeText(t)}</p>
                        ))}
                    </div>
                  ) : null
                }}
              />
              <Area
                // Recharts prioritizes item-level data when scatter series are
                // present. Keep closes in that same axis-domain collection.
                data={points}
                type="linear"
                dataKey="close"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.1)"
                isAnimationActive={false}
                connectNulls={false}
              />
              {buys.length > 0 && (
                <Scatter
                  name="Buy executions"
                  data={buys}
                  dataKey="markerPrice"
                  fill="hsl(var(--foreground))"
                  isAnimationActive={false}
                  shape={<TradeDot />}
                  onClick={entry => setSelected({key, date: entry.date})}
                />
              )}
              {sells.length > 0 && (
                <Scatter
                  name="Sell executions"
                  data={sells}
                  dataKey="markerPrice"
                  fill="hsl(var(--destructive))"
                  isAnimationActive={false}
                  shape={<TradeDot />}
                  onClick={entry => setSelected({key, date: entry.date})}
                />
              )}
              {currentCost !== null && (
                <ReferenceLine
                  y={currentCost}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {(trades.length>0||currentCost!=null)&& <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Trade marker legend">
        {buys.length>0&&<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-foreground"/>Your buys · {buys.length}</span>}
        {sells.length>0&&<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive"/>Your sells · {sells.length}</span>}
        {currentCost!=null&&<span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t border-dashed border-muted-foreground"/>Average cost {money(currentCost)}</span>}
        {markers.some(t => t.dateOnly) && <span title="Hollow markers show the actual trade date in the bottom lane, not an execution price.">○ Date only</span>}
      </div>}
      {dates.length > 0 && (
        <label className="sr-only text-xs text-muted-foreground focus-within:not-sr-only">
          Read chart day
          <Select
            aria-label="Read instrument history by date"
            value={date ?? dates.at(-1)}
            onChange={(e) => setSelected({ key, date: e.target.value })}
          >
            {dates.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </label>
      )}
      {selected?.key===key&&dayTrades.length > 0 && (
        <ul aria-label={`Executions on ${date}`} className="space-y-1 text-xs">
          {dayTrades.map((t) => (
            <li key={t.id}>{tradeText(t)}</li>
          ))}
        </ul>
      )}
      {children}
      {history&&<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <p className="min-w-0 flex-1">Prices from Yahoo Finance: daily close, split-adjusted, excluding dividends. {history.status==='stale'||error?'Saved history; refresh unavailable. ':''}Updated <time dateTime={updatedAt??undefined} title={updatedAt??undefined}>{holdingSourceTime(updatedAt)?.short??'time unavailable'}</time>{last?.provisional?' · provisional':''}.</p>
        <button type="button" disabled={loading} className="min-h-8 text-primary hover:underline" onClick={()=>setRetry(n=>n+1)}>Refresh history</button>
      </div>}
    </section>
  )
}

function TradeDot({cx,cy,fill,payload}:{cx?:number;cy?:number;fill?:string;payload?:{dateOnly?:boolean;date?:string;quantity?:number;amount?:number}}) {
  if(cx==null||cy==null)return <g />
  return <circle cx={cx} cy={cy} r={5} fill={payload?.dateOnly?'hsl(var(--card))':fill} stroke={fill} strokeWidth={2}>
    <title>{(payload?.quantity??payload?.amount??0)>0?'Buy':'Sell'} · {payload?.date}{payload?.dateOnly?' · date only':''}</title>
  </circle>
}
