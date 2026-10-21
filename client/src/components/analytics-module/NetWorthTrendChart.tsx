import { memo, useId, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { TrendingUp } from 'lucide-react'
import { InteractiveAreaChart } from '../common/interactive-area-chart'
import { usePrivacy } from '../../context/PrivacyContext'
import type { TrendDataPoint } from './types'
import { Button } from '../common/button'
import { CashBalanceComparisonChart } from './CashBalanceComparisonChart'
import type { CashBalanceComparison } from './cash-balance-comparison'

type NetWorthTrendChartProps = {
  data: TrendDataPoint[]
  masterCurrency: string
  title?: string
  comparison?: CashBalanceComparison
  comparisonDisabledReason?: string
}

export const NetWorthTrendChart = memo(function NetWorthTrendChart({ data, masterCurrency, title = 'Cash Balance Trend', comparison, comparisonDisabledReason }: NetWorthTrendChartProps) {
  const { privacyMode } = usePrivacy()
  const [compare, setCompare] = useState(false)
  const reasonId = useId()
  const unavailableReason = comparisonDisabledReason || comparison?.unavailableReason
  const comparing = compare && comparison !== undefined && !unavailableReason

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
          </div>
          {comparison && <Button type="button" size="sm" variant={comparing ? 'default' : 'outline'} className="self-start enabled:cursor-pointer sm:self-auto"
            aria-pressed={comparing} disabled={Boolean(unavailableReason)} aria-describedby={unavailableReason ? reasonId : undefined} onClick={() => setCompare(previous => !previous)}>
            {comparing ? 'Hide comparison' : 'Compare previous month'}
          </Button>}
        </div>
        {comparison && unavailableReason && <p id={reasonId} className="text-xs text-muted-foreground">{unavailableReason}</p>}
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {comparing ? <CashBalanceComparisonChart key={comparison.selectedMonth} comparison={comparison} currency={masterCurrency} /> : data.length > 1 ? (
          <InteractiveAreaChart
            data={data.map(point => ({ date: point.date, value: point.balance, reference: point.smoothed }))}
            label="Cash balance"
            formatValue={value => value === null ? 'Unavailable' : `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${masterCurrency}`}
            reference={{ label: 'Trend', color: 'hsl(var(--muted-foreground))', dashed: true }}
            hidden={privacyMode === 'hidden'}
            showReadout
            className="h-48 sm:h-64"
          />
        ) : (
          <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">
            Need more data points to show trend
          </div>
        )}
      </CardContent>
    </Card>
  )
})
