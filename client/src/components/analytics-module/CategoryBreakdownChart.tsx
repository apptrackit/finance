import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { PieChart as PieChartIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { COLORS } from './constants'

type CategoryData = {
  name: string
  icon: string
  value: number
  percentage: number
}

type CategoryBreakdownChartProps = {
  data: CategoryData[]
  masterCurrency: string
}

export function CategoryBreakdownChart({ data, masterCurrency }: CategoryBreakdownChartProps) {
  const { privacyMode } = usePrivacy()

  return (
    <Card>
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm sm:text-base">Spending by Category</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {data.length > 0 ? (
          <div className="flex flex-col items-center gap-4">
            <div className="h-40 w-40 sm:h-48 sm:w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => privacyMode === 'hidden' ? '••••••' : `${value.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${masterCurrency}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px'
                    }}
                    itemStyle={{
                      color: 'hsl(var(--foreground))'
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-2">
              {data.slice(0, 5).map((cat, index) => (
                <div key={cat.name} className="flex items-center gap-2 sm:gap-3">
                  <div 
                    className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-xs sm:text-sm flex-shrink-0">{cat.icon}</span>
                  <span className="text-xs sm:text-sm flex-1 truncate">{cat.name}</span>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <span className={`text-xs sm:text-sm font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : cat.value.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </span>
                    <span className={`text-[10px] sm:text-xs text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      ({privacyMode === 'hidden' ? '••' : cat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No expense data available
          </div>
        )}
      </CardContent>
    </Card>
  )
}
