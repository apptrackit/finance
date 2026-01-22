import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { calculateYAxisDomain } from './utils'
import { COLORS } from './constants'
import type { Account, TrendDataPoint } from './types'

type PerAccountTrendChartProps = {
  account: Account
  data: TrendDataPoint[]
  index: number
  masterCurrency: string
  convertToMasterCurrency: (amount: number, accountId: string) => number
  className?: string
}

export function PerAccountTrendChart({ account, data, index, masterCurrency, convertToMasterCurrency, className }: PerAccountTrendChartProps) {
  const { privacyMode } = usePrivacy()

  return (
    <Card className={className}>
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg">{account.icon || '💳'}</span>
          <CardTitle className="text-sm sm:text-base truncate flex-1">{account.name}</CardTitle>
          <span className={`text-xs text-muted-foreground flex-shrink-0 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
            {privacyMode === 'hidden' ? '••••••' : convertToMasterCurrency(account.balance, account.id).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.length > 0 ? (
          <div className="h-36 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`accountGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="formattedDate" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  domain={calculateYAxisDomain(data)}
                  tickFormatter={(value) => {
                    if (privacyMode === 'hidden') return '••••'
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                    return value.toFixed(0)
                  }}
                  width={45}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className={`text-sm font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`} style={{ color: COLORS[index % COLORS.length] }}>
                            {privacyMode === 'hidden' ? '••••••' : `${payload[0].value?.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${masterCurrency}`}
                          </p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#accountGradient-${index})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-36 sm:h-48 flex items-center justify-center text-muted-foreground text-sm">
            No transaction data in this period
          </div>
        )}
      </CardContent>
    </Card>
  )
}
