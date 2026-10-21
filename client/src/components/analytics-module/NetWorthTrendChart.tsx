import { memo, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { InteractiveAreaChart } from '../common/interactive-area-chart'
import { usePrivacy } from '../../context/PrivacyContext'
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
  const [showTrend, setShowTrend] = useState(false)
  const reasonId = useId()
  const unavailableReason = comparisonDisabledReason || comparison?.unavailableReason
  const comparing = compare && comparison !== undefined && !unavailableReason
  const hidden = privacyMode === 'hidden'

  return <section className="easyui-area-card lg:col-span-2" aria-label={title}>
    {comparing ? <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><h3 className="text-[13px] text-muted-foreground">{title}</h3>{controls}</div>
      <CashBalanceComparisonChart key={comparison.selectedMonth} comparison={comparison} currency={masterCurrency} />
    </> : data.length > 1 ? <InteractiveAreaChart
      data={data.map(point => ({ date: point.date, value: point.balance, reference: point.smoothed }))}
      label="Cash balance" title={title} controls={controls} periodLabel={periodLabel}
      formatValue={value => value === null ? 'Unavailable' : `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${masterCurrency}`}
      reference={showTrend ? { label: 'Trend', color: 'hsl(var(--muted-foreground))', dashed: true } : undefined}
      hidden={hidden} showReadout showChange
      className="h-[240px] sm:h-[280px]"
    /> : <><h3 className="text-[13px] text-muted-foreground">{title}</h3><div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Need more data points to show trend</div></>}
    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
      {!comparing && !hidden && <button type="button" aria-pressed={showTrend} className="easyui-chart-control" onClick={() => setShowTrend(previous => !previous)}>Trend</button>}
      {comparison && <button type="button" className="easyui-chart-control" aria-pressed={comparing}
        disabled={Boolean(unavailableReason)} aria-describedby={unavailableReason ? reasonId : undefined} onClick={() => setCompare(previous => !previous)}>
        {comparing ? 'Hide comparison' : 'Compare previous month'}
      </button>}
    </div>
    {comparison && unavailableReason && <p id={reasonId} className="mt-1 text-xs text-muted-foreground">{unavailableReason}</p>}
  </section>
})
