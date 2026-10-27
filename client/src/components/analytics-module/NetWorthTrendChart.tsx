import { memo, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { InteractiveAreaChart } from '../common/interactive-area-chart'
import { usePrivacy } from '../../context/PrivacyContext'
import { cn } from '../../lib/utils'
import type { TrendDataPoint } from './types'
import { CashBalanceComparisonChart } from './CashBalanceComparisonChart'
import type { CashBalanceComparison } from './cash-balance-comparison'

type NetWorthTrendChartProps = {
  data: TrendDataPoint[]
  masterCurrency: string
  title?: string
  controls?: ReactNode
  periodLabel?: string
  comparison?: CashBalanceComparison
  comparisonDisabledReason?: string
}

export const NetWorthTrendChart = memo(function NetWorthTrendChart({ data, masterCurrency, title = 'Cash Balance Trend', controls, periodLabel, comparison, comparisonDisabledReason }: NetWorthTrendChartProps) {
  const { privacyMode } = usePrivacy()
  const [compare, setCompare] = useState(false)
  const [showTrend, setShowTrend] = useState(true)
  const reasonId = useId()
  const unavailableReason = comparisonDisabledReason || comparison?.unavailableReason
  const comparing = compare && comparison !== undefined && !unavailableReason
  const hidden = privacyMode === 'hidden'
  const chartHeight = 'h-[240px] sm:h-[280px]'
  // The label never changes and Trend keeps its slot while comparing, so the
  // toggle stays under the pointer in both views.
  const buttons = <>
    {!hidden && <button type="button" aria-pressed={showTrend} className={cn('easyui-chart-control', comparing && 'invisible')} onClick={() => setShowTrend(previous => !previous)}>Trend</button>}
    {comparison && <button type="button" className="easyui-chart-control" aria-pressed={comparing}
      disabled={Boolean(unavailableReason)} aria-describedby={unavailableReason ? reasonId : undefined} onClick={() => setCompare(previous => !previous)}>
      Compare previous {comparison.unit}
    </button>}
  </>

  return <section className="easyui-area-card lg:col-span-2" aria-label={title}>
    {comparing ? <CashBalanceComparisonChart key={comparison.selectedStart} comparison={comparison} currency={masterCurrency}
      title={title} controls={controls} footer={buttons} className={chartHeight} />
    // Keeps the masked comparison's readout and plot rows, so hiding values
    // doesn't make the compare toggle jump either.
    : hidden && data.length > 1 ? <div className="min-w-0">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 min-[480px]:flex-row min-[480px]:gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-normal text-muted-foreground">{title}</h3>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">••••••</p>
          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-[13px]">{periodLabel ?? 'In period'} · balance change</p>
        </div>
        {controls}
      </div>
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground', chartHeight)}>Chart hidden for privacy</div>
      {comparison && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{buttons}</div>}
    </div>
    : data.length > 1 ? <InteractiveAreaChart
      data={data.map(point => ({ date: point.date, value: point.balance, reference: point.smoothed }))}
      label="Cash balance" title={title} controls={controls} periodLabel={periodLabel}
      formatValue={value => value === null ? 'Unavailable' : `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${masterCurrency}`}
      reference={showTrend ? { label: 'Trend', color: 'hsl(var(--muted-foreground))', dashed: true } : undefined}
      showReadout showChange calendarAxis
      className={chartHeight}
      footer={buttons}
    /> : <><h3 className="text-[13px] text-muted-foreground">{title}</h3><div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Need more data points to show trend</div></>}
    {!comparing && data.length <= 1 && (comparison || !hidden) && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{buttons}</div>}
    {comparison && unavailableReason && <p id={reasonId} className="mt-1 text-xs text-muted-foreground">{unavailableReason}</p>}
  </section>
})
