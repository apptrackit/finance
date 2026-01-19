import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { calculateYAxisDomain } from './utils'
import type { TrendDataPoint } from './types'

type NetWorthTrendChartProps = {
  data: TrendDataPoint[]
  masterCurrency: string
}

export function NetWorthTrendChart({ data, masterCurrency }: NetWorthTrendChartProps) {
  const { privacyMode } = usePrivacy()

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm sm:text-base">Net Worth Trend</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.length > 1 ? (
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="formattedDate" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={calculateYAxisDomain(data)}
                  tickFormatter={(value) => {
                    if (privacyMode === 'hidden') return '••••'
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                    return value.toFixed(0)
                  }}
                  width={50}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className={`text-sm font-bold text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
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
                  name="Net Worth"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#netWorthGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">
            Need more data points to show trend
          </div>
        )}
      </CardContent>
    </Card>
  )
}
