import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BrainCircuit } from 'lucide-react'
import { addDays, format, isLastDayOfMonth, startOfDay, subMonths } from 'date-fns'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Account, FinancialOutlookSnapshot, Transaction } from './types'

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
  isForecast: boolean
}

type CashPathPoint = { day: number; low: number; expected: number; high: number }
type HistoryRange = '90d' | '12m' | 'all'

const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: '90d', label: '90 days + 90 days' },
  { value: '12m', label: '12 months + 90 days' },
  { value: 'all', label: 'All time + 90 days' },
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
  const start = range === '90d'
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
  const [historyRange, setHistoryRange] = useState<HistoryRange>('90d')
  const hasExtendedHistory = Boolean(snapshot?.cash_balance_history_year?.length && snapshot?.cash_balance_history_alltime?.length)
  const usesReconstruction = !hasExtendedHistory && (historyRange !== '90d' || snapshot?.cash_balance_history?.length !== 90)
  const hasMissingFx = usesReconstruction && accounts.some(account => account.type !== 'investment' && !account.exclude_from_cash_balance && convertToHuf(1, account.id) === null)

  const { chartData, generationTimestamp } = useMemo(() => {
    if (!snapshot?.cash_balance_path?.length) return { chartData: [] as ChartPoint[], generationTimestamp: null }
    // Forecast day 0 uses the server's UTC calendar date, matching the
    // persisted historical series even when the viewer is in another zone.
    const forecastStart = dateFromHistory(snapshot.source_queried_at.slice(0, 10))
    if (Number.isNaN(forecastStart.getTime())) return { chartData: [] as ChartPoint[], generationTimestamp: null }

    const points = new Map<number, ChartPoint>()
    const storedHistory = hasExtendedHistory
      ? historyRange === 'all'
        ? snapshot.cash_balance_history_alltime
        : historyRange === '12m'
          ? snapshot.cash_balance_history_year
          : snapshot.cash_balance_history
      : historyRange === '90d' && snapshot.cash_balance_history?.length === 90
        ? snapshot.cash_balance_history
        : reconstructHistory(snapshot, transactions, accounts, convertToHuf, forecastStart, historyRange)
    for (const historical of storedHistory) {
      if (!Number.isFinite(historical.balance)) continue
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

  return (
    <section className="border-t border-border/60 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Cash history & AI forecast</p>
        <select
          aria-label="Cash history range"
          value={historyRange}
          onChange={event => setHistoryRange(event.target.value as HistoryRange)}
          className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-foreground"
        >
          {HISTORY_RANGES.map(range => <option key={range.value} value={range.value}>{range.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Actual history through generation date · AI projection</span>
      </div>
      {usesReconstruction && <p className="mt-1 text-xs text-muted-foreground">Earlier history is reconstructed using current transactions, account settings, and exchange rates, so it may change.</p>}
      {hasMissingFx && <p className="mt-1 text-xs text-muted-foreground">Some account currencies have no exchange rate; their earlier movements are excluded.</p>}
      <div className="mt-3 h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="aiOutlookActualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiOutlookFutureGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-4, 280 65% 60%))" stopOpacity={0.22} />
                <stop offset="95%" stopColor="hsl(var(--chart-4, 280 65% 60%))" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickCount={8} tickFormatter={value => format(new Date(value), historyRange === 'all' ? 'MMM yyyy' : 'MMM d')} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} domain={yDomain} width={50} tickFormatter={value => hidden ? '••••' : value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1_000)}K`} />
            <Tooltip content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined
              if (!active || !point) return null
              return (
                <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                  <p className="mb-1 text-xs text-muted-foreground">{point.label} · {point.isForecast ? 'AI forecast' : 'Actual balance'}</p>
                  {point.isForecast ? <>
                    <p className={`text-sm font-bold text-purple-400 ${hidden ? 'select-none' : ''}`}>{amount(point.expected!, hidden)}</p>
                    <p className={`text-xs text-muted-foreground ${hidden ? 'select-none' : ''}`}>{amount(point.low!, hidden)} – {amount(point.high!, hidden)}</p>
                  </> : <p className={`text-sm font-bold text-primary ${hidden ? 'select-none' : ''}`}>{amount(point.actual!, hidden)}</p>}
                </div>
              )
            }} />
            {generationTimestamp && <ReferenceLine x={generationTimestamp} stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeDasharray="4 4" />}
            <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2.25} fill="url(#aiOutlookActualGradient)" connectNulls={false} dot={false} />
            <Area type="linear" dataKey="high" stroke="transparent" fill="url(#aiOutlookFutureGradient)" connectNulls={false} />
            <Area type="linear" dataKey="low" stroke="transparent" fill="hsl(var(--card))" fillOpacity={1} connectNulls={false} />
            <Line type="linear" dataKey="low" stroke="hsl(var(--chart-4, 280 65% 60%))" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={false} />
            <Line type="linear" dataKey="high" stroke="hsl(var(--chart-4, 280 65% 60%))" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={false} />
            <Line type="linear" dataKey="expected" stroke="hsl(var(--chart-4, 280 65% 60%))" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded-full bg-primary" /> Actual</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded-full bg-purple-400" /> AI forecast</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-purple-400/70" /> Possible range</span>
      </div>
    </section>
  )
}
