import { memo, useState } from 'react'
import { InteractiveAreaChart } from '../common/interactive-area-chart'
import { usePrivacy } from '../../context/PrivacyContext'
import { cn } from '../../lib/utils'
import type { Account, TrendDataPoint } from './types'

type PerAccountTrendChartProps = {
  account: Account
  data: TrendDataPoint[]
  index: number
  className?: string
}

export const PerAccountTrendChart = memo(function PerAccountTrendChart({ account, data, className }: PerAccountTrendChartProps) {
  const { privacyMode } = usePrivacy()
  const [showTrend, setShowTrend] = useState(true)

  return <section className={cn('easyui-area-card', className)} aria-label={`${account.name} trend`}>
    {data.length > 0 ? <InteractiveAreaChart
      data={data.map(point => ({ date: point.date, value: point.balance, reference: point.smoothed }))}
      label={`${account.name} balance`} title={account.name}
      formatValue={value => value === null ? 'Unavailable' : `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${account.currency}`}
      reference={showTrend ? { label: 'Trend', color: 'hsl(var(--muted-foreground))', dashed: true } : undefined}
      hidden={privacyMode === 'hidden'} showReadout showChange className="h-[200px] sm:h-[240px]"
    /> : <><h3 className="text-[13px] text-muted-foreground">{account.name}</h3><div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No transaction data in this period</div></>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Current balance: {privacyMode === 'hidden' ? '••••••' : account.balance.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {account.currency}</p>
      {privacyMode !== 'hidden' && data.length > 0 && <button type="button" aria-pressed={showTrend} onClick={() => setShowTrend(previous => !previous)} className="easyui-chart-control">Trend</button>}
    </div>
  </section>
})
