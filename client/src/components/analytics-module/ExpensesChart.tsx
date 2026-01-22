import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { usePrivacy } from '../../context/PrivacyContext'
import { CustomSelect } from './CustomSelect'
import type { ChartDataPoint, Category } from './types'

type ExpensesChartProps = {
  data: ChartDataPoint[]
  selectedCategory: string
  onCategoryChange: (value: string) => void
  categories: Category[]
  masterCurrency: string
}

export function ExpensesChart({ data, selectedCategory, onCategoryChange, categories, masterCurrency }: ExpensesChartProps) {
  const { privacyMode } = usePrivacy()
  
  // Calculate total sum
  const totalSum = data.reduce((sum, item) => sum + item.amount, 0)

  return (
    <Card>
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <div className="flex flex-col">
              <CardTitle className="text-sm sm:text-base">Expenses</CardTitle>
              <p className={`text-xs text-destructive font-semibold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : `Total: ${totalSum.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${masterCurrency}`}
              </p>
            </div>
          </div>
          <CustomSelect
            value={selectedCategory}
            onChange={onCategoryChange}
            variant="destructive"
            options={[
              { value: 'all', label: 'All', icon: '📊' },
              ...categories.map(cat => ({
                value: cat.id,
                label: cat.name,
                icon: cat.icon
              }))
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.some(d => d.amount > 0) ? (
          <div className="h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="label" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (privacyMode === 'hidden') return '••••'
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                    return value.toFixed(0)
                  }}
                  width={50}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const currentIndex = data.findIndex(d => d.label === label)
                      const previousValue = currentIndex > 0 ? data[currentIndex - 1].amount : null
                      const currentValue = payload[0].value as number
                      const change = previousValue !== null ? currentValue - previousValue : null
                      const changePercent = previousValue !== null && previousValue !== 0 
                        ? ((currentValue - previousValue) / previousValue) * 100 
                        : null

                      return (
                        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className={`text-sm font-bold text-destructive ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '••••••' : `${currentValue.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${masterCurrency}`}
                          </p>
                          {change !== null && changePercent !== null && (
                            <p className={`text-xs ${change >= 0 ? 'text-destructive' : 'text-success'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                              {privacyMode === 'hidden' ? '••••' : `${change >= 0 ? '+' : ''}${change.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%)`}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="amount" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 sm:h-48 flex items-center justify-center text-muted-foreground text-sm">
            No expense data
          </div>
        )}
      </CardContent>
    </Card>
  )
}
