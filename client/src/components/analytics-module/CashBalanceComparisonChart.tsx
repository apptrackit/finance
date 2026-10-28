import { useId } from 'react'
import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { cn } from '../../lib/utils'
import { comparisonDelta } from './cash-balance-comparison'
import type { CashBalanceComparison, CashBalanceComparisonPoint, CashBalanceComparisonUnit } from './cash-balance-comparison'

function ComparisonReadout({ point, currency, unit }: { point: CashBalanceComparisonPoint; currency: string; unit: CashBalanceComparisonUnit }) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'
  const amount = (value: number, signed = false) => hidden ? '••••••' : `${signed && value > 0 ? '+' : ''}${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${currency}`
  const delta = comparisonDelta(point.selected, point.previous)
  return (
    <div className="space-y-1.5 text-xs">
      {point.selected !== null && point.selectedDate && (
        <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span className="text-muted-foreground">{format(parseISO(point.selectedDate), 'MMM d, yyyy')}</span>
          <span className="font-semibold text-primary">{amount(point.selected)}</span>
        </p>
      )}
      {point.previous !== null && point.previousDate && (
        <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span className="text-muted-foreground">{format(parseISO(point.previousDate), 'MMM d, yyyy')}</span>
          <span className="font-semibold">{amount(point.previous)}</span>
        </p>
      )}
      {delta && <p className="border-t border-border/60 pt-1.5">
        <span className="text-muted-foreground">Difference: </span>
        <span className="font-semibold">{amount(delta.amount, true)}{!hidden && delta.percentage !== null ? ` (${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%)` : ''}</span>
      </p>}
      {point.selected === null && point.previous !== null && <p className="text-muted-foreground">Only the previous {unit} has an actual balance on this day.</p>}
      {point.previous === null && point.selected !== null && <p className="text-muted-foreground">The previous {unit} has no matching calendar day.</p>}
      {point.selected === null && point.previous === null && <p className="text-muted-foreground">No actual balance is available on this day yet.</p>}
    </div>
  )
}

// Mirrors InteractiveAreaChart's readout, plot and legend rows (and the
// caller's plot height), so switching views keeps the card and its toggles still.
export function CashBalanceComparisonChart({ comparison, currency, title, controls, footer, className }: {
  comparison: CashBalanceComparison
  currency: string
  title: string
  controls?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'
  const gradientId = useId()
  const common = comparison.points.filter(point => point.selected !== null && point.previous !== null)
  const latestCommon = common[common.length - 1]
  const values = comparison.points.flatMap(item => [item.selected, item.previous]).filter((value): value is number => value !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.15, Math.max(Math.abs(min), Math.abs(max)) * 0.05, 1)
  const delta = latestCommon ? comparisonDelta(latestCommon.selected, latestCommon.previous) : null
  const yearly = comparison.unit === 'year'
  const labelFormat = yearly ? 'yyyy' : 'MMMM yyyy'
  const selectedLabel = format(parseISO(comparison.selectedStart), labelFormat)
  const previousLabel = format(parseISO(comparison.previousStart), labelFormat)
  // Yearly slots are month/day positions; label every other month start.
  const monthStarts = comparison.points.filter(point => (point.selectedDate ?? point.previousDate)?.endsWith('-01'))
  const ticks = yearly ? monthStarts.filter((_, index) => index % 2 === 0).map(point => point.day) : [1, 5, 10, 15, 20, 25, comparison.points.length]
  const tickLabel = (day: number) => {
    if (!yearly) return `${day}`
    const point = comparison.points[day - 1]
    const date = point?.selectedDate ?? point?.previousDate
    return date ? format(parseISO(date), 'MMM') : ''
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 min-[480px]:flex-row min-[480px]:gap-4">
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <h3 className="text-[13px] font-normal text-muted-foreground">{title}</h3>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {!delta ? '–' : hidden ? '••••••' : `${delta.amount > 0 ? '+' : ''}${delta.amount.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${currency}`}
          </p>
          {/* One line, like the balance readout, so the card height never changes. */}
          <p className="mt-1 truncate text-xs tabular-nums sm:text-[13px]">
            {delta && !hidden && delta.percentage !== null && <span className={delta.percentage >= 0 ? 'easyui-chart-positive' : 'easyui-chart-negative'}>{delta.percentage > 0 ? '+' : ''}{delta.percentage.toFixed(1)}% </span>}
            <span className="text-muted-foreground">{delta && latestCommon
              ? `${format(parseISO(latestCommon.selectedDate!), 'MMM d')} vs ${format(parseISO(latestCommon.previousDate!), 'MMM d')} · latest shared day`
              : 'No shared day to compare yet'}</span>
          </p>
        </div>
        {controls}
      </div>
      <div className={cn('h-[280px] min-w-0', className)}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart accessibilityLayer data={comparison.points} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient></defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.5} />
            <XAxis dataKey="day" type="number" domain={[1, comparison.points.length]} ticks={ticks} tickFormatter={tickLabel} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis domain={[min - padding, max + padding]} width={56} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false}
              tickFormatter={value => hidden ? '••••' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
            <Tooltip content={({ active, payload }) => {
              const activePoint = payload?.[0]?.payload as CashBalanceComparisonPoint | undefined
              return active && activePoint ? <div className="min-w-48 rounded-lg border border-border bg-card p-3 shadow-lg"><ComparisonReadout point={activePoint} currency={currency} unit={comparison.unit} /></div> : null
            }} />
            {/* A year has too many days for point markers. */}
            <Area type="monotone" dataKey="selected" name={selectedLabel} stroke="hsl(var(--primary))" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={yearly ? false : { r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="previous" name={previousLabel} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={yearly ? false : { r: 2, fill: 'hsl(var(--card))', strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-2 text-xs text-muted-foreground sm:px-0" aria-label="Cash balance comparison legend">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 bg-primary" />{selectedLabel}</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t border-muted-foreground" />{previousLabel}</span>
        </div>
        {footer && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
