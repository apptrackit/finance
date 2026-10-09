import { useId, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, format, isLastDayOfMonth, startOfDay, subMonths } from 'date-fns'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Account, FinancialOutlookHistoricalCashPoint, FinancialOutlookSnapshot, Transaction } from './types'

type AICashOutlookChartProps = {
  snapshot: FinancialOutlookSnapshot | null
  transactions: Transaction[]
  accounts: Account[]
  convertToHuf: (amount: number, accountId: string) => number | null
}

type ChartPoint = {
  timestamp: number
  label: string
  actual?: number
  low?: number
  expected?: number
  high?: number
  range?: [number, number]
  isForecast: boolean
}

type CashPathPoint = { day: number; low: number; expected: number; high: number }
type HistoryRange = '30d' | '90d' | '12m' | 'all'

const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '1 year' },
  { value: 'all', label: 'All time' },
]

function dailyPath(points: CashPathPoint[]) {
  const ordered = [...points]
    .filter(point => Number.isFinite(point.day) && point.day >= 0 && point.day <= 90)
    .sort((left, right) => left.day - right.day)

  if (ordered.length < 2 || ordered[0].day !== 0 || ordered.at(-1)?.day !== 90) return []

  let segment = 0
  return Array.from({ length: 91 }, (_, day) => {
    while (segment < ordered.length - 2 && ordered[segment + 1].day < day) segment += 1
    const from = ordered[segment]
    const to = ordered[segment + 1] ?? from
    const progress = to.day === from.day ? 0 : (day - from.day) / (to.day - from.day)
    const interpolate = (key: 'low' | 'expected' | 'high') => from[key] + (to[key] - from[key]) * progress
    return { day, low: interpolate('low'), expected: interpolate('expected'), high: interpolate('high') }
  })
}

function amount(value: number, hidden: boolean) {
  if (hidden) return '••••••'
  return `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} HUF`
}

function dateFromHistory(date: string) {
  // Ledger dates are local calendar days, not midnight UTC instants.
  return startOfDay(new Date(`${date}T12:00:00`))
}

/**
 * Extend a legacy snapshot backwards from its saved actual balance, or from
 * forecast day zero when the snapshot predates stored 90-day history. Current
 * posted ledger rows supply the earlier movements; the snapshot remains intact.
 */
function reconstructHistory(snapshot: FinancialOutlookSnapshot, transactions: Transaction[], accounts: Account[], convertToHuf: (amount: number, accountId: string) => number | null, endDate: Date, range: HistoryRange) {
  const cashAccounts = accounts.filter(account => account.type !== 'investment' && !account.exclude_from_cash_balance)
  const accountIds = new Set(cashAccounts.map(account => account.id))
  const generationDate = format(endDate, 'yyyy-MM-dd')
  const stored = snapshot.cash_balance_history?.length === 90 ? snapshot.cash_balance_history : []
  const anchor = stored[0] || { date: generationDate, balance: snapshot.cash_balance_path[0]?.expected }
  if (typeof anchor.balance !== 'number' || !Number.isFinite(anchor.balance)) return stored
  const movements = new Map<string, number>()
  let firstAvailableDate = anchor.date
  for (const transaction of transactions) {
    if (!accountIds.has(transaction.account_id) || transaction.status === 'pending' || transaction.status === 'cancelled' || transaction.date > generationDate) continue
    const converted = convertToHuf(transaction.amount, transaction.account_id)
    if (converted === null || !Number.isFinite(converted)) continue
    movements.set(transaction.date, (movements.get(transaction.date) || 0) + converted)
    if (transaction.date < firstAvailableDate) firstAvailableDate = transaction.date
  }
  const yearStart = format(subMonths(endDate, 12), 'yyyy-MM-dd')
  const start = range === '30d'
    ? format(addDays(endDate, -29), 'yyyy-MM-dd')
    : range === '90d'
      ? format(addDays(endDate, -89), 'yyyy-MM-dd')
      : range === '12m'
        ? (firstAvailableDate > yearStart ? firstAvailableDate : yearStart)
        : firstAvailableDate
  const older: Array<{ date: string; balance: number }> = []
  let cursor = dateFromHistory(anchor.date)
  let balance = anchor.balance
  while (format(cursor, 'yyyy-MM-dd') > start) {
    balance -= movements.get(format(cursor, 'yyyy-MM-dd')) || 0
    cursor = addDays(cursor, -1)
    const date = format(cursor, 'yyyy-MM-dd')
    if (range !== 'all' || date >= yearStart || date === start || isLastDayOfMonth(cursor)) older.push({ date, balance })
  }
  return [...older.reverse(), ...(stored.length ? stored : [anchor]).filter(point => point.date >= start)]
}

export function AICashOutlookChart({ snapshot, transactions, accounts, convertToHuf }: AICashOutlookChartProps) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'
  const gradientId = useId()
  const [historyRange, setHistoryRange] = useState<HistoryRange>('90d')
  const hasExtendedHistory = Boolean(snapshot?.cash_balance_history_year?.length && snapshot?.cash_balance_history_alltime?.length)
  const usesReconstruction = !hasExtendedHistory && (!['30d', '90d'].includes(historyRange) || snapshot?.cash_balance_history?.length !== 90)
  const hasMissingFx = usesReconstruction && accounts.some(account => account.type !== 'investment' && !account.exclude_from_cash_balance && convertToHuf(1, account.id) === null)
  const dailyHistoryStart = snapshot?.cash_balance_history_year?.[0]?.date
  const hasMonthlyHistory = historyRange === 'all' && hasExtendedHistory && Boolean(dailyHistoryStart && snapshot?.cash_balance_history_alltime.some(point => point.date < dailyHistoryStart))

  const { chartData, generationTimestamp } = useMemo(() => {
    if (!snapshot?.cash_balance_path?.length) return { chartData: [] as ChartPoint[], generationTimestamp: null }
    // Forecast day 0 uses the server's UTC calendar date, matching the
    // persisted historical series even when the viewer is in another zone.
    const forecastStart = dateFromHistory(snapshot.source_queried_at.slice(0, 10))
    if (Number.isNaN(forecastStart.getTime())) return { chartData: [] as ChartPoint[], generationTimestamp: null }

    const points = new Map<number, ChartPoint>()
    // All-time snapshots contain month-end samples, but also save daily year
    // and 90-day history. Prefer those daily values rather than discarding the
    // movements visible in the shorter ranges. Do not mutate the snapshot.
    const allTimeHistory = new Map<string, FinancialOutlookHistoricalCashPoint>()
    const allTimeStart = snapshot.cash_balance_history_alltime?.reduce((first, point) => point.date < first ? point.date : first, snapshot.cash_balance_history_alltime[0]?.date)
    for (const historical of [...(snapshot.cash_balance_history_alltime || []), ...(snapshot.cash_balance_history_year || []), ...(snapshot.cash_balance_history || [])]) {
      if (Number.isFinite(historical.balance) && (!allTimeStart || historical.date >= allTimeStart)) allTimeHistory.set(historical.date, historical)
    }
    const storedHistory = hasExtendedHistory
      ? historyRange === 'all'
        ? [...allTimeHistory.values()]
        : historyRange === '12m'
          ? snapshot.cash_balance_history_year
          : snapshot.cash_balance_history
      : ['30d', '90d'].includes(historyRange) && snapshot.cash_balance_history?.length === 90
        ? snapshot.cash_balance_history
        : reconstructHistory(snapshot, transactions, accounts, convertToHuf, forecastStart, historyRange)
    for (const historical of storedHistory) {
      if (historyRange === '30d' && historical.date < format(addDays(forecastStart, -29), 'yyyy-MM-dd')) continue
      if (!Number.isFinite(historical.balance) || historical.date > format(forecastStart, 'yyyy-MM-dd')) continue
      const date = dateFromHistory(historical.date)
      if (Number.isNaN(date.getTime())) continue
      points.set(date.getTime(), {
        timestamp: date.getTime(),
        label: format(date, 'MMM d, yyyy'),
        actual: historical.balance,
        isForecast: false,
      })
    }

    for (const projection of dailyPath(snapshot.cash_balance_path)) {
      const date = addDays(forecastStart, projection.day)
      const timestamp = date.getTime()
      const existing = points.get(timestamp)
      points.set(timestamp, {
        timestamp,
        label: format(date, 'MMM d, yyyy'),
        actual: existing?.actual,
        low: projection.low,
        expected: projection.expected,
        high: projection.high,
        range: [projection.low, projection.high],
        // Older immutable snapshots did not persist history, so retain a
        // usable forecast-only view for them instead of showing an empty
        // "actual" tooltip at day zero.
        isForecast: projection.day > 0 || existing?.actual === undefined,
      })
    }

    return { chartData: [...points.values()].sort((a, b) => a.timestamp - b.timestamp), generationTimestamp: forecastStart.getTime() }
  }, [snapshot, transactions, accounts, convertToHuf, hasExtendedHistory, historyRange])

  const yDomain = useMemo(() => {
    const values = chartData.flatMap(point => [point.actual, point.low, point.high]).filter((value): value is number => Number.isFinite(value))
    if (!values.length) return [0, 100]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.12, Math.abs(max) * 0.04, 1)
    return [min - padding, max + padding]
  }, [chartData])

  if (!snapshot || chartData.length < 8) return null
  const firstTimestamp = chartData[0].timestamp
  const lastTimestamp = chartData.at(-1)!.timestamp
  const xTicks = Array.from({ length: 8 }, (_, index) => startOfDay(new Date(firstTimestamp + (lastTimestamp - firstTimestamp) * index / 7)).getTime())

  return (
    <section className="px-5 pb-5 pt-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="w-full text-sm font-semibold sm:w-auto">Cash history &amp; forecast</h3>
        <div className="flex flex-1 flex-wrap items-center gap-3 text-xs text-muted-foreground sm:ml-2">
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-3.5 bg-primary" />Actual</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3.5 border-t-2 border-dashed border-forecast" />AI forecast</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-3.5 rounded-sm bg-forecast/20" />Possible range</span>
        </div>
        <div className="w-full sm:w-auto">
          <p className="mb-1.5 text-xs text-muted-foreground">History</p>
          <div role="radiogroup" aria-label="Cash history range" className="grid grid-cols-4 rounded-lg border border-border bg-background p-1 text-xs font-medium">
            {HISTORY_RANGES.map(range => <label key={range.value} className="relative min-w-0 cursor-pointer">
              <input type="radio" name={`${gradientId}-history`} value={range.value} checked={historyRange === range.value} onChange={() => setHistoryRange(range.value)} className="peer sr-only" />
              <span className="block whitespace-nowrap rounded-md px-2 py-2 text-center text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-secondary peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring sm:px-3">{range.label}</span>
            </label>)}
          </div>
        </div>
      </div>
      {usesReconstruction && <p className="mt-1 text-xs text-muted-foreground">Earlier history is reconstructed using current transactions, account settings, and exchange rates, so it may change.</p>}
      {hasMissingFx && <p className="mt-1 text-xs text-muted-foreground">Some account currencies have no exchange rate; their earlier movements are excluded.</p>}
      {hasMonthlyHistory && <p className="mt-1 text-xs text-muted-foreground">History before {format(dateFromHistory(dailyHistoryStart!), 'MMM d, yyyy')} uses saved monthly balances; the past year uses daily balances.</p>}
      <div className="mt-5 h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 24, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.14} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} interval="preserveStartEnd" minTickGap={24} tickFormatter={value => format(new Date(value), historyRange === 'all' ? 'MMM d, yy' : 'MMM d')} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} domain={yDomain} width={50} tickFormatter={value => hidden ? '••••' : Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1_000)}K`} />
            <Tooltip content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined
              if (!active || !point) return null
              return (
                <div className="rounded-xl border border-border bg-popover px-3 py-2.5 shadow-xl">
                  <p className="mb-1 text-xs text-muted-foreground">{point.label} · {point.isForecast ? 'AI forecast' : 'Actual balance'}</p>
                  {point.isForecast ? <>
                    <p className={`text-sm font-bold text-forecast ${hidden ? 'select-none' : ''}`}>{amount(point.expected!, hidden)}</p>
                    <p className={`text-xs text-muted-foreground ${hidden ? 'select-none' : ''}`}>{amount(point.low!, hidden)} – {amount(point.high!, hidden)}</p>
                  </> : <p className={`text-sm font-bold text-primary ${hidden ? 'select-none' : ''}`}>{amount(point.actual!, hidden)}</p>}
                </div>
              )
            }} />
            {generationTimestamp !== null && <ReferenceLine x={generationTimestamp} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: format(new Date(generationTimestamp), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'Today' : 'Generated', position: historyRange === 'all' ? 'insideTopRight' : 'insideTop', fill: 'hsl(var(--foreground))', fontSize: 11 }} />}
            <Area type="linear" dataKey="actual" name="Actual cash" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${gradientId})`} connectNulls={false} dot={false} isAnimationActive={false} />
            <Area type="linear" dataKey="range" name="Possible range" stroke="none" fill="hsl(var(--forecast))" fillOpacity={0.16} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="expected" name="AI forecast" stroke="hsl(var(--forecast))" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Cash balances in HUF through generation day. The main cash chart uses current data and your selected currency.</p>
    </section>
  )
}
