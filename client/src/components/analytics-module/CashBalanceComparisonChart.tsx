import { useId } from 'react'
import { format, parseISO } from 'date-fns'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { comparisonDelta } from './cash-balance-comparison'
import type { CashBalanceComparison, CashBalanceComparisonPoint } from './cash-balance-comparison'

function ComparisonReadout({ point, currency }: { point: CashBalanceComparisonPoint; currency: string }) {
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
      {point.selected === null && point.previous !== null && <p className="text-muted-foreground">Only the previous month has an actual balance on this day.</p>}
      {point.previous === null && point.selected !== null && <p className="text-muted-foreground">The previous month has no matching calendar day.</p>}
      {point.selected === null && point.previous === null && <p className="text-muted-foreground">No actual balance is available on this day yet.</p>}
    </div>
  )
}

export function CashBalanceComparisonChart({ comparison, currency }: { comparison: CashBalanceComparison; currency: string }) {
  const { privacyMode } = usePrivacy()
  const gradientId = useId()
  const common = comparison.points.filter(point => point.selected !== null && point.previous !== null)
  const latestCommon = common[common.length - 1]
  const values = comparison.points.flatMap(item => [item.selected, item.previous]).filter((value): value is number => value !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.15, Math.max(Math.abs(min), Math.abs(max)) * 0.05, 1)
  const delta = latestCommon ? comparisonDelta(latestCommon.selected, latestCommon.previous) : null
  const selectedLabel = format(parseISO(comparison.selectedMonth), 'MMMM yyyy')
  const previousLabel = format(parseISO(comparison.previousMonth), 'MMMM yyyy')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-2 sm:px-0 text-xs" aria-label="Cash balance comparison legend">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary" />{selectedLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground" />{previousLabel}</span>
      </div>
      {delta && latestCommon && <div className="px-2 sm:px-0">
        <p className="text-lg font-semibold tabular-nums">
          {privacyMode === 'hidden' ? '••••••' : `${delta.amount > 0 ? '+' : ''}${delta.amount.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${currency}${delta.percentage !== null ? ` (${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%)` : ''}`}
        </p>
        <p className="text-xs text-muted-foreground">{format(parseISO(latestCommon.selectedDate!), 'MMM d, yyyy')} vs {format(parseISO(latestCommon.previousDate!), 'MMM d, yyyy')} · latest shared day</p>
      </div>}
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart accessibilityLayer data={comparison.points} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient></defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.5} />
            <XAxis dataKey="day" type="number" domain={[1, comparison.points.length]} ticks={[1, 5, 10, 15, 20, 25, comparison.points.length]} tickFormatter={day => `${day}`} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis domain={[min - padding, max + padding]} width={56} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false}
              tickFormatter={value => privacyMode === 'hidden' ? '••••' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
            <Tooltip content={({ active, payload }) => {
              const activePoint = payload?.[0]?.payload as CashBalanceComparisonPoint | undefined
              return active && activePoint ? <div className="min-w-48 rounded-lg border border-border bg-card p-3 shadow-lg"><ComparisonReadout point={activePoint} currency={currency} /></div> : null
            }} />
            <Area type="monotone" dataKey="selected" name={selectedLabel} stroke="hsl(var(--primary))" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="previous" name={previousLabel} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={{ r: 2, fill: 'hsl(var(--card))', strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
