import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { TrendingUp } from 'lucide-react'
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format, subMonths, addMonths, addDays, differenceInDays, startOfDay } from 'date-fns'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Account } from './types'

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  linked_transaction_id?: string
}

type PredictionChartProps = {
  transactions: Transaction[]
  accounts: Account[]
  masterCurrency: string
  exchangeRates: Record<string, number>
  convertToMasterCurrency: (amount: number, accountId: string) => number
}

type ChartPoint = {
  date: string
  formattedDate: string
  actual?: number
  predicted?: number
  isPast: boolean
}

/**
 * Build daily balance series for the past N months by replaying transactions
 * backwards from the current total balance.
 */
function buildDailyBalances(
  transactions: Transaction[],
  accounts: Account[],
  convertToMasterCurrency: (amount: number, accountId: string) => number,
  startDate: Date,
  endDate: Date
): { date: string; balance: number }[] {
  // Only cash accounts (no investment, no excluded)
  const cashAccounts = accounts.filter(
    a => a.type !== 'investment' && !a.exclude_from_net_worth
  )
  const cashAccountIds = new Set(cashAccounts.map(a => a.id))

  const currentBalance = cashAccounts.reduce(
    (sum, a) => sum + convertToMasterCurrency(a.balance, a.id),
    0
  )

  // Sum transactions by date (only cash accounts)
  const txByDate: Record<string, number> = {}
  transactions
    .filter(tx => cashAccountIds.has(tx.account_id))
    .forEach(tx => {
      txByDate[tx.date] = (txByDate[tx.date] || 0) + convertToMasterCurrency(tx.amount, tx.account_id)
    })

  // Build daily balances from today backwards
  const today = startOfDay(new Date())
  const allDates = Object.keys(txByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  )

  const dateBalanceMap: Record<string, number> = {}
  let running = currentBalance
  const todayStr = format(today, 'yyyy-MM-dd')
  dateBalanceMap[todayStr] = currentBalance

  allDates.forEach(d => {
    dateBalanceMap[d] = running
    running -= txByDate[d]
  })

  // Now fill in every day in the requested range
  const result: { date: string; balance: number }[] = []
  const totalDays = differenceInDays(endDate, startDate)

  // Build a sorted list of known dates with balances
  const knownDates = Object.keys(dateBalanceMap).sort()

  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(startDate, i)
    const dStr = format(d, 'yyyy-MM-dd')

    if (dateBalanceMap[dStr] !== undefined) {
      result.push({ date: dStr, balance: dateBalanceMap[dStr] })
    } else {
      // Find the most recent known balance before this date
      let bal = currentBalance
      for (let j = knownDates.length - 1; j >= 0; j--) {
        if (knownDates[j] <= dStr) {
          bal = dateBalanceMap[knownDates[j]]
          break
        }
      }
      result.push({ date: dStr, balance: bal })
    }
  }

  return result
}

/**
 * Predict future balance using day-of-month seasonal decomposition.
 *
 * Algorithm:
 * 1. From the past 3 months of daily changes, compute an average daily delta
 *    for each day-of-month (1–31). This captures recurring patterns like
 *    salary on the 10th, rent on the 1st, subscriptions on specific days, etc.
 * 2. Apply these seasonal daily deltas cumulatively starting from today's balance
 *    to produce the predicted 3-month trajectory.
 * 3. Overlay a gentle overall trend (linear drift) to account for net savings/spending.
 */
function predictFutureBalance(
  dailyBalances: { date: string; balance: number }[],
  forecastDays: number
): { date: string; balance: number }[] {
  if (dailyBalances.length < 14) return []

  const today = startOfDay(new Date())
  const todayStr = format(today, 'yyyy-MM-dd')

  // Calculate daily changes
  const dailyChanges: { date: string; dayOfMonth: number; dayOfWeek: number; change: number }[] = []
  for (let i = 1; i < dailyBalances.length; i++) {
    const d = new Date(dailyBalances[i].date)
    dailyChanges.push({
      date: dailyBalances[i].date,
      dayOfMonth: d.getDate(),
      dayOfWeek: d.getDay(),
      change: dailyBalances[i].balance - dailyBalances[i - 1].balance,
    })
  }

  // Compute average change per day-of-month (seasonal pattern)
  const domChanges: Record<number, number[]> = {}
  dailyChanges.forEach(dc => {
    if (!domChanges[dc.dayOfMonth]) domChanges[dc.dayOfMonth] = []
    domChanges[dc.dayOfMonth].push(dc.change)
  })
  const avgDomChange: Record<number, number> = {}
  Object.entries(domChanges).forEach(([dom, changes]) => {
    avgDomChange[Number(dom)] = changes.reduce((s, c) => s + c, 0) / changes.length
  })

  // Compute average change per day-of-week (weekly pattern)
  const dowChanges: Record<number, number[]> = {}
  dailyChanges.forEach(dc => {
    if (!dowChanges[dc.dayOfWeek]) dowChanges[dc.dayOfWeek] = []
    dowChanges[dc.dayOfWeek].push(dc.change)
  })
  const avgDowChange: Record<number, number> = {}
  Object.entries(dowChanges).forEach(([dow, changes]) => {
    avgDowChange[Number(dow)] = changes.reduce((s, c) => s + c, 0) / changes.length
  })

  // Overall daily trend (linear drift)
  const totalChange = dailyBalances[dailyBalances.length - 1].balance - dailyBalances[0].balance
  const overallDailyTrend = totalChange / dailyBalances.length

  // Starting balance = today's balance
  const todayEntry = dailyBalances.find(d => d.date === todayStr)
  let balance = todayEntry?.balance ?? dailyBalances[dailyBalances.length - 1].balance

  const predictions: { date: string; balance: number }[] = []

  for (let i = 1; i <= forecastDays; i++) {
    const futureDate = addDays(today, i)
    const dom = futureDate.getDate()
    const dow = futureDate.getDay()

    // Blend day-of-month pattern (70%) + day-of-week pattern (20%) + overall trend (10%)
    const domDelta = avgDomChange[dom] ?? overallDailyTrend
    const dowDelta = avgDowChange[dow] ?? overallDailyTrend
    const delta = domDelta * 0.7 + dowDelta * 0.2 + overallDailyTrend * 0.1

    balance += delta
    predictions.push({
      date: format(futureDate, 'yyyy-MM-dd'),
      balance,
    })
  }

  return predictions
}

export function PredictionChart({
  transactions,
  accounts,
  masterCurrency,
  exchangeRates,
  convertToMasterCurrency,
}: PredictionChartProps) {
  const { privacyMode } = usePrivacy()

  const chartData = useMemo((): ChartPoint[] => {
    const today = startOfDay(new Date())
    const pastStart = subMonths(today, 3)
    const futureEnd = addMonths(today, 3)

    // Build past 3 months of daily balances
    const dailyBalances = buildDailyBalances(
      transactions,
      accounts,
      convertToMasterCurrency,
      pastStart,
      today
    )

    // Generate predictions for ~90 days
    const forecastDays = differenceInDays(futureEnd, today)
    const predictions = predictFutureBalance(dailyBalances, forecastDays)

    // Combine into chart data
    const points: ChartPoint[] = []

    // Past data points (sample to avoid too many points — every day)
    dailyBalances.forEach(d => {
      points.push({
        date: d.date,
        formattedDate: format(new Date(d.date), 'MMM d'),
        actual: d.balance,
        predicted: undefined,
        isPast: true,
      })
    })

    // Bridge: today appears in both series for continuity
    const todayBalance = dailyBalances[dailyBalances.length - 1]?.balance
    if (todayBalance !== undefined) {
      const todayStr = format(today, 'yyyy-MM-dd')
      // Make sure the last actual point also has predicted value
      const lastIdx = points.length - 1
      if (lastIdx >= 0 && points[lastIdx].date === todayStr) {
        points[lastIdx].predicted = todayBalance
      }
    }

    // Future predictions
    predictions.forEach(p => {
      points.push({
        date: p.date,
        formattedDate: format(new Date(p.date), 'MMM d'),
        actual: undefined,
        predicted: p.balance,
        isPast: false,
      })
    })

    return points
  }, [transactions, accounts, exchangeRates, masterCurrency])

  // Calculate Y domain
  const yDomain = useMemo(() => {
    const values = chartData
      .map(d => d.actual ?? d.predicted ?? 0)
      .filter(v => v !== 0)
    if (values.length === 0) return [0, 100]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    const padding = Math.max(range * 0.15, max * 0.05)
    return [Math.max(0, min - padding), max + padding]
  }, [chartData])

  const todayStr = format(new Date(), 'MMM d')

  if (chartData.length < 2) {
    return null
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm sm:text-base">Cash Balance Forecast</CardTitle>
          <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">3 mo</span>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="predActualGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="predFutureGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-4, 280 65% 60%))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--chart-4, 280 65% 60%))" stopOpacity={0} />
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
                domain={yDomain}
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
                    const actualEntry = payload.find(p => p.dataKey === 'actual')
                    const predictedEntry = payload.find(p => p.dataKey === 'predicted')
                    const value = actualEntry?.value ?? predictedEntry?.value
                    const isPrediction = !actualEntry?.value && !!predictedEntry?.value
                    return (
                      <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
                        <p className="text-xs text-muted-foreground mb-1">
                          {label} {isPrediction && <span className="text-[10px] opacity-70">(predicted)</span>}
                        </p>
                        <p className={`text-sm font-bold ${isPrediction ? 'text-purple-400' : 'text-primary'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden'
                            ? '••••••'
                            : `${Number(value)?.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${masterCurrency}`}
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              {/* Today reference line */}
              <ReferenceLine
                x={todayStr}
                stroke="hsl(var(--foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: 'Today',
                  position: 'top',
                  fontSize: 10,
                  fill: 'hsl(var(--muted-foreground))',
                }}
              />
              {/* Actual past data */}
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#predActualGradient)"
                connectNulls={false}
                dot={false}
              />
              {/* Predicted future data */}
              <Area
                type="monotone"
                dataKey="predicted"
                name="Predicted"
                stroke="hsl(var(--chart-4, 280 65% 60%))"
                strokeWidth={2}
                strokeDasharray="6 3"
                fillOpacity={1}
                fill="url(#predFutureGradient)"
                connectNulls={false}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-primary rounded-full" /> Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: 'hsl(280 65% 60%)', opacity: 0.8 }} /> Predicted
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
