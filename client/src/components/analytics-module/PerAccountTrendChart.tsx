import { memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { InteractiveAreaChart } from '../common/interactive-area-chart'
import { usePrivacy } from '../../context/PrivacyContext'
import { COLORS } from './constants'
import type { Account, TrendDataPoint } from './types'

type PerAccountTrendChartProps = {
  account: Account
  data: TrendDataPoint[]
  index: number
  className?: string
}

export const PerAccountTrendChart = memo(function PerAccountTrendChart({ account, data, index, className }: PerAccountTrendChartProps) {
  const { privacyMode } = usePrivacy()

  return (
    <Card className={className}>
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg">{account.icon || '💳'}</span>
          <CardTitle className="text-sm sm:text-base truncate flex-1">{account.name}</CardTitle>
          <span className={`text-xs text-muted-foreground flex-shrink-0 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••••' : account.balance.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {account.currency}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.length > 0 ? (
          <InteractiveAreaChart
            data={data.map(point => ({ date: point.date, value: point.balance, reference: point.smoothed }))}
            label={`${account.name} balance`}
            color={COLORS[index % COLORS.length]}
            formatValue={value => value === null ? 'Unavailable' : `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${account.currency}`}
            reference={{ label: 'Trend', color: 'hsl(var(--muted-foreground))', dashed: true }}
            hidden={privacyMode === 'hidden'}
            showReadout
            className="h-36 sm:h-48"
          />
        ) : (
          <div className="h-36 sm:h-48 flex items-center justify-center text-muted-foreground text-sm">
            No transaction data in this period
          </div>
        )}
      </CardContent>
    </Card>
  )
})
