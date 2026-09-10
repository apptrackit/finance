import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BrainCircuit } from 'lucide-react'
import { addDays, format, startOfDay } from 'date-fns'
import { usePrivacy } from '../../context/PrivacyContext'
import type { FinancialOutlookSnapshot } from './types'

type AICashOutlookChartProps = {
  snapshot: FinancialOutlookSnapshot | null
}

type ChartPoint = {
  timestamp: number
  label: string
  low: number
  expected: number
  high: number
}

type CashPathPoint = Pick<ChartPoint, 'low' | 'expected' | 'high'> & { day: number }

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

export function AICashOutlookChart({ snapshot }: AICashOutlookChartProps) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'

  const chartData = useMemo((): ChartPoint[] => {
    if (!snapshot?.cash_balance_path?.length) return []
    const start = startOfDay(new Date(snapshot.source_queried_at))
    if (Number.isNaN(start.getTime())) return []
    return dailyPath(snapshot.cash_balance_path).map(point => {
      const date = addDays(start, point.day)
      return { ...point, timestamp: date.getTime(), label: format(date, 'MMM d, yyyy') }
    })
  }, [snapshot])

  const yDomain = useMemo(() => {
    const values = chartData.flatMap(point => [point.low, point.high]).filter(Number.isFinite)
    if (!values.length) return [0, 100]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.12, Math.abs(max) * 0.04, 1)
    return [Math.max(0, min - padding), max + padding]
  }, [chartData])

  if (!snapshot || chartData.length < 8) return null

  return (
    <section className="border-t border-border/60 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Expected cash trend</p>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">90 days</span>
        <span className="text-xs text-muted-foreground">AI-generated cash projection · checked {new Date(snapshot.source_queried_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
      <div className="mt-3 h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickCount={7}
              tickFormatter={value => format(new Date(value), 'MMM d')}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={yDomain}
              width={50}
              tickFormatter={value => hidden ? '••••' : value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1_000)}K`}
            />
            <Tooltip
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined
                if (!active || !point) return null
                return (
                  <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                    <p className="mb-1 text-xs text-muted-foreground">{point.label} · AI forecast</p>
                    <p className={`text-sm font-bold text-primary ${hidden ? 'select-none' : ''}`}>{amount(point.expected, hidden)}</p>
                    <p className={`text-xs text-muted-foreground ${hidden ? 'select-none' : ''}`}>{amount(point.low, hidden)} – {amount(point.high, hidden)}</p>
                  </div>
                )
              }}
            />
            <Area type="linear" dataKey="high" stroke="transparent" fill="hsl(var(--primary))" fillOpacity={0.13} connectNulls />
            <Area type="linear" dataKey="low" stroke="transparent" fill="hsl(var(--card))" fillOpacity={1} connectNulls />
            <Line type="linear" dataKey="low" stroke="hsl(var(--primary))" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="linear" dataKey="high" stroke="hsl(var(--primary))" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="linear" dataKey="expected" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded-full bg-primary" /> Expected</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-primary/60" /> Possible range</span>
      </div>
    </section>
  )
}
