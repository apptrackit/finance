import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
export function InvestmentChart({
  symbol,
  transactions = [],
  averageCost,
  costCurrency,
  cache,
  revisionKey = '',
}: {
  symbol: string
  transactions?: Trade[]
  averageCost?: number | null
  costCurrency?: string
  cache?: HoldingChartCache
  revisionKey?: string
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
            (p) => !Number.isFinite(p.close) || p.close <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(p.date),
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
  const points = useMemo(
    () => history?.points.map((p) => ({ ...p, time: Date.parse(`${p.date}T00:00:00Z`) })) ?? [],
    [history],
  )
  const markers = useMemo(() => {
    // Date-only markers sit in a separate bottom lane, never at an inferred fill.
    const lowest = Math.min(...points.map(p => p.close))
    const highest = Math.max(...points.map(p => p.close))
    const lane = Math.max(0, lowest - Math.max((highest - lowest) * 0.12, lowest * 0.03))
    return trades.map(t => {
      const exact = t.price != null && Number.isFinite(t.price) && t.price > 0 && t.execution_currency === history?.currency
      return {...t, time: Date.parse(`${t.date}T00:00:00Z`), markerPrice: exact ? t.price! : lane, dateOnly: !exact}
    })
  }, [trades, points, history?.currency])
  const buys = markers.filter((t) => (t.quantity ?? t.amount) > 0)
  const sells = markers.filter((t) => (t.quantity ?? t.amount) < 0)
  const dates = [...new Set([...points.map((p) => p.date), ...trades.map((t) => t.date)])].sort()
  const first = points.at(0),
    last = points.at(-1),
    splitInRange = history?.events.some((e) => e.type === 'split') ?? false
  const change = first && last && !splitInRange ? last.close - first.close : null,
    rawPercent = change !== null && first ? (change / first.close) * 100 : null
  const percent = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null
  const money = (n: number | null | undefined) => unitPrice(n, history?.currency ?? '')
  const date = selected?.key === key ? selected.date : last?.date
  const dayTrades = trades.filter((t) => t.date === date),
    close = points.find((p) => p.date === date)?.close
  const tradeText = (t: Trade) =>
    `${(t.quantity ?? t.amount) > 0 ? 'Buy' : 'Sell'} · ${Math.abs(t.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 12 })} units · ${unitPrice(t.price, t.execution_currency ?? 'unverified currency')} · ${t.date}`
  const currentCost = averageCost != null && costCurrency === history?.currency ? averageCost : null
  const domain = [
    Math.min(...points.map((p) => p.time), ...markers.map((t) => t.time)),
    Math.max(...points.map((p) => p.time), ...markers.map((t) => t.time)),
  ]
  return (
    <section aria-label="Instrument price history" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Price history</h3>
        <div
          role="group"
          aria-label="Instrument chart range"
          className="flex max-w-full overflow-x-auto rounded-lg bg-background p-1"
        >
          {RANGES.map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`min-h-9 rounded-md px-2 text-xs ${range === value ? 'bg-secondary font-semibold' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums">
          {close != null ? money(close) : date ? 'Daily close unavailable' : 'Price unavailable'}
          {selected?.key === key && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{date}</span>
          )}
        </p>
        {change !== null && percent !== null && (
          <p className="text-xs text-muted-foreground">
            {change >= 0 ? '+' : ''}
            {money(change)} ({percent.toFixed(2)}%) · selected range
          </p>
        )}
        {splitInRange && (
          <p className="text-xs text-muted-foreground">Range change unavailable across split events.</p>
        )}
      </div>
      {history && (
        <p className="text-[10px] text-muted-foreground">
          Yahoo Finance · daily unadjusted close · excludes dividends · {history.currency} ·{' '}
          {history.status === 'stale' || error ? 'Saved history; refresh unavailable' : 'Retrieved'}{' '}
          {history.retrieved_at}
          {last?.provisional ? ' · current session provisional' : ''}
        </p>
      )}
      {history?.events.some(event => event.type === 'split') && (
        <p className="text-xs text-muted-foreground">
          Stock splits occur in this range. Price history alone does not establish complete portfolio
          returns.
        </p>
      )}
      <button
        type="button"
        disabled={loading}
        className="min-h-9 text-xs text-primary underline"
        onClick={() => setRetry((n) => n + 1)}
      >
        Refresh history
      </button>
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
      <div className="h-64 w-full sm:h-80" aria-label="Daily instrument price history">
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
              margin={{ left: 0, right: 6, top: 12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="time"
                type="number"
                domain={domain}
                scale="time"
                tickFormatter={(t) => new Date(Number(t)).toISOString().slice(5, 10)}
                minTickGap={38}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                width={55}
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
                tickFormatter={(n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 })}
              />
              <Tooltip
                filterNull={false}
                content={({ active, payload }) => {
                  const p = (active ? payload?.[0]?.payload : undefined) as
                    { date?: string; close?: number; time?: number; dateOnly?: boolean } | undefined
                  const d = p?.date ?? (p?.time ? new Date(p.time).toISOString().slice(0, 10) : null)
                  return d ? (
                    <div className="max-w-64 rounded-lg border border-border bg-card p-3 text-xs shadow-lg">
                      <p>{d}</p>
                      {p?.dateOnly && <p className="text-muted-foreground">Date only · execution price unavailable in chart currency</p>}
                      {p?.close != null && <p>Daily close: {money(p.close)}</p>}
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
                  fill="hsl(var(--success))"
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
      {trades.length > 0 && <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Trade marker legend">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success"/>Buy · {buys.length}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destructive"/>Sell · {sells.length}</span>
        {markers.some(t => t.dateOnly) && <span title="Hollow markers show the actual trade date in the bottom lane, not an execution price.">○ Date only</span>}
      </div>}
      {dates.length > 0 && (
        <label className="block text-xs text-muted-foreground">
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
      {dayTrades.length > 0 && (
        <ul aria-label={`Executions on ${date}`} className="space-y-1 text-xs">
          {dayTrades.map((t) => (
            <li key={t.id}>{tradeText(t)}</li>
          ))}
        </ul>
      )}
      {trades.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-10 cursor-pointer">
            {trades.length} executions in range{trades.length > 100 ? ' · latest 100 listed' : ''}
          </summary>
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {trades.slice(-100).map((t) => (
              <li key={t.id}>{tradeText(t)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function TradeDot({cx,cy,fill,payload}:{cx?:number;cy?:number;fill?:string;payload?:{dateOnly?:boolean;date?:string;quantity?:number;amount?:number}}) {
  if(cx==null||cy==null)return <g />
  return <circle cx={cx} cy={cy} r={5} fill={payload?.dateOnly?'hsl(var(--card))':fill} stroke={fill} strokeWidth={2}>
    <title>{(payload?.quantity??payload?.amount??0)>0?'Buy':'Sell'} · {payload?.date}{payload?.dateOnly?' · date only':''}</title>
  </circle>
}
