import { memo, useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { usePrivacy } from '../../context/PrivacyContext'

export type IncomeExpensesTrendPoint = {
  key: string
  label: string
  tooltipLabel?: string
  income: number
  expenses: number
  netIncome: number
}

export type IncomeExpensesTrendResolution = 'default' | 'quarter' | 'year'

export type IncomeExpensesTrendResolutionOption = {
  value: IncomeExpensesTrendResolution
  label: string
}

type IncomeExpensesTrendChartProps = {
  data: IncomeExpensesTrendPoint[]
  masterCurrency: string
  resolution?: IncomeExpensesTrendResolution
  resolutionOptions?: IncomeExpensesTrendResolutionOption[]
  onResolutionChange?: (resolution: IncomeExpensesTrendResolution) => void
}

const formatCompactAmount = (value: number) => {
  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-' : ''

  if (absoluteValue >= 1_000_000) return `${prefix}${(absoluteValue / 1_000_000).toFixed(1)}M`
  if (absoluteValue >= 1_000) return `${prefix}${(absoluteValue / 1_000).toFixed(0)}K`
  return `${prefix}${absoluteValue.toFixed(0)}`
}

const LegendItem = ({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
    <span
      aria-hidden="true"
      className={dashed ? 'w-5 border-t-2 border-dashed' : 'h-2.5 w-2.5 rounded-full'}
      style={{ borderColor: dashed ? color : undefined, backgroundColor: dashed ? undefined : color }}
    />
    {label}
  </span>
)

export const IncomeExpensesTrendChart = memo(function IncomeExpensesTrendChart({
  data,
  masterCurrency,
  resolution = 'default',
  resolutionOptions = [],
  onResolutionChange,
}: IncomeExpensesTrendChartProps) {
  const { privacyMode } = usePrivacy()

  const yDomain = useMemo(() => {
    const values = data.flatMap(point => [point.income, point.expenses, point.netIncome, 0])
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.12, Math.abs(max) * 0.08, 1)
    return [Math.min(0, min - padding), Math.max(0, max + padding)] as [number, number]
  }, [data])

  const formatCurrency = (value: number) => `${value.toLocaleString('hu-HU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${masterCurrency}`

  const hasValues = data.some(point => point.income > 0 || point.expenses > 0)

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="px-4 pb-2 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <CardTitle className="text-sm sm:text-base">Income vs Expenses · Over Time</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {resolutionOptions.length > 0 && (
              <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/70 p-1" aria-label="Chart resolution">
                {resolutionOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onResolutionChange?.(option.value)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors sm:px-2.5 ${
                      resolution === option.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Chart legend">
              <LegendItem color="hsl(var(--success))" label="Income" />
              <LegendItem color="hsl(var(--destructive))" label="Expenses" />
              <LegendItem color="hsl(var(--primary))" label="Net Income" dashed />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {hasValues ? (
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barGap={8} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.55} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={yDomain}
                  width={56}
                  tickFormatter={value => privacyMode === 'hidden' ? '••••' : formatCompactAmount(value)}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const values = Object.fromEntries(payload.map(item => [item.dataKey, Number(item.value)])) as Record<string, number>
                    const tooltipLabel = (payload[0]?.payload as IncomeExpensesTrendPoint | undefined)?.tooltipLabel ?? label
                    const rows = [
                      { key: 'income', label: 'Income', color: 'text-success' },
                      { key: 'expenses', label: 'Expenses', color: 'text-destructive' },
                      { key: 'netIncome', label: 'Net income', color: 'text-primary' },
                    ]

                    return (
                      <div className="min-w-40 rounded-lg border border-border bg-card p-3 shadow-lg">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">{tooltipLabel}</p>
                        <div className="space-y-1.5">
                          {rows.map(row => (
                            <div key={row.key} className="flex items-center justify-between gap-4 text-xs">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className={`font-semibold ${row.color} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                {privacyMode === 'hidden' ? '••••••' : formatCurrency(values[row.key] ?? 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="income" name="Income" fill="hsl(var(--success))" radius={[5, 5, 0, 0]} maxBarSize={42} />
                <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[5, 5, 0, 0]} maxBarSize={42} />
                <Line
                  type="monotone"
                  dataKey="netIncome"
                  name="Net Income"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground sm:h-80">
            No income or expense data for this period
          </div>
        )}
      </CardContent>
    </Card>
  )
})
