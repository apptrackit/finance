import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts'
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, subYears, startOfYear, endOfYear, isThisMonth, isThisYear } from 'date-fns'

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type Account = {
  id: string
  name: string
  type: string
  balance: number
  icon?: string
}

type TimePeriod = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'allTime'

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--destructive))',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
]

export function Analytics({ 
  transactions,
  categories,
  accounts
}: { 
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
}) {
  const [period, setPeriod] = useState<TimePeriod>('thisMonth')

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    const now = new Date()
    
    return transactions.filter(tx => {
      const txDate = new Date(tx.date)
      
      switch (period) {
        case 'thisMonth':
          return isWithinInterval(txDate, {
            start: startOfMonth(now),
            end: endOfMonth(now)
          })
        case 'lastMonth':
          const lastMonth = subMonths(now, 1)
          return isWithinInterval(txDate, {
            start: startOfMonth(lastMonth),
            end: endOfMonth(lastMonth)
          })
        case 'thisYear':
          return isWithinInterval(txDate, {
            start: startOfYear(now),
            end: endOfYear(now)
          })
        case 'lastYear':
          const lastYear = subYears(now, 1)
          return isWithinInterval(txDate, {
            start: startOfYear(lastYear),
            end: endOfYear(lastYear)
          })
        case 'allTime':
        default:
          return true
      }
    })
  }, [transactions, period])

  // Calculate totals
  const { totalIncome, totalExpenses, netFlow } = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0)
    const expenses = filteredTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    return {
      totalIncome: income,
      totalExpenses: expenses,
      netFlow: income - expenses
    }
  }, [filteredTransactions])

  // Spending by category data
  const categoryData = useMemo(() => {
    const expensesByCategory: Record<string, number> = {}
    
    filteredTransactions
      .filter(t => t.amount < 0)
      .forEach(t => {
        const categoryId = t.category_id || 'uncategorized'
        expensesByCategory[categoryId] = (expensesByCategory[categoryId] || 0) + Math.abs(t.amount)
      })

    return Object.entries(expensesByCategory)
      .map(([categoryId, amount]) => {
        const category = categories.find(c => c.id === categoryId)
        return {
          name: category?.name || 'Other',
          icon: category?.icon || '📦',
          value: amount,
          percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [filteredTransactions, categories, totalExpenses])

  // Net Worth Trend data - shows total balance over time
  const netWorthTrendData = useMemo(() => {
    // Get current total balance
    const currentTotalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0)
    
    // Get all dates with transactions, sorted newest first
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
    // Group transactions by date and sum them
    const transactionsByDate: Record<string, number> = {}
    sortedTransactions.forEach(tx => {
      transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + tx.amount
    })
    
    // Calculate balance at end of each date by working backwards
    const dateBalances: Record<string, number> = {}
    let runningBalance = currentTotalBalance
    
    // Start with today's balance
    const today = format(new Date(), 'yyyy-MM-dd')
    dateBalances[today] = currentTotalBalance
    
    // Get unique dates sorted newest first
    const uniqueDates = Object.keys(transactionsByDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )
    
    // Work backwards - each date shows balance AFTER that day's transactions
    uniqueDates.forEach(date => {
      // This date's balance is the running balance (which includes this date's transactions)
      dateBalances[date] = runningBalance
      // Then subtract this date's transactions to get balance before this date
      runningBalance -= transactionsByDate[date]
    })
    
    // Filter to selected period and convert to array
    return Object.entries(dateBalances)
      .map(([date, balance]) => ({
        date,
        formattedDate: format(new Date(date), 'MMM d'),
        balance
      }))
      .filter(d => {
        const txDate = new Date(d.date)
        switch (period) {
          case 'thisMonth':
            return isThisMonth(txDate)
          case 'lastMonth':
            return txDate >= startOfMonth(subMonths(new Date(), 1)) && txDate < startOfMonth(new Date())
          case 'thisYear':
            return isThisYear(txDate)
          case 'lastYear':
            const lastYear = new Date().getFullYear() - 1
            return txDate.getFullYear() === lastYear
          default:
            return true
        }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [transactions, accounts, period])

  // Per-account Net Worth Trend data
  const perAccountTrendData = useMemo(() => {
    return accounts.map(account => {
      const accountTransactions = transactions.filter(t => t.account_id === account.id)
      
      // Group transactions by date and sum them
      const transactionsByDate: Record<string, number> = {}
      accountTransactions.forEach(tx => {
        transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + tx.amount
      })
      
      // Calculate balance at end of each date
      const dateBalances: Record<string, number> = {}
      let runningBalance = account.balance
      
      const today = format(new Date(), 'yyyy-MM-dd')
      dateBalances[today] = account.balance
      
      // Get unique dates sorted newest first
      const uniqueDates = Object.keys(transactionsByDate).sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      )
      
      // Work backwards - each date shows balance AFTER that day's transactions
      uniqueDates.forEach(date => {
        dateBalances[date] = runningBalance
        runningBalance -= transactionsByDate[date]
      })
      
      const data = Object.entries(dateBalances)
        .map(([date, balance]) => ({
          date,
          formattedDate: format(new Date(date), 'MMM d'),
          balance
        }))
        .filter(d => {
          const txDate = new Date(d.date)
          switch (period) {
            case 'thisMonth':
              return isThisMonth(txDate)
            case 'lastMonth':
              return txDate >= startOfMonth(subMonths(new Date(), 1)) && txDate < startOfMonth(new Date())
            case 'thisYear':
              return isThisYear(txDate)
            case 'lastYear':
              const lastYear = new Date().getFullYear() - 1
              return txDate.getFullYear() === lastYear
            default:
              return true
          }
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      
      return {
        account,
        data
      }
    })
  }, [accounts, transactions, period])

  // Income vs Expenses bar chart data
  const incomeExpenseBarData = useMemo(() => {
    const periodData: Record<string, { income: number; expenses: number }> = {}
    
    filteredTransactions.forEach(tx => {
      // Group by week or month depending on period
      const dateKey = period === 'allTime' || period === 'thisYear' || period === 'lastYear'
        ? format(new Date(tx.date), 'yyyy-MM')
        : format(new Date(tx.date), 'yyyy-MM-dd')
      
      if (!periodData[dateKey]) {
        periodData[dateKey] = { income: 0, expenses: 0 }
      }
      if (tx.amount > 0) {
        periodData[dateKey].income += tx.amount
      } else {
        periodData[dateKey].expenses += Math.abs(tx.amount)
      }
    })

    return Object.entries(periodData)
      .map(([key, data]) => ({
        key,
        label: period === 'allTime' || period === 'thisYear' || period === 'lastYear'
          ? format(new Date(key + '-01'), 'MMM yy')
          : format(new Date(key), 'MMM d'),
        income: data.income,
        expenses: data.expenses
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12) // Last 12 periods
  }, [filteredTransactions, period])

  // Period labels
  const periodLabels: Record<TimePeriod, string> = {
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    thisYear: 'This Year',
    lastYear: 'Last Year',
    allTime: 'All Time'
  }

  const hasData = filteredTransactions.length > 0

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Analytics</h2>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-secondary/50 border border-border/50">
          {(Object.keys(periodLabels) as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No transactions for {periodLabels[period].toLowerCase()}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add some transactions to see analytics</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-br from-success/10 to-transparent border-success/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Income</p>
                    <p className="text-2xl font-bold text-success">
                      +{totalIncome.toLocaleString('hu-HU')} Ft
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-success" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-destructive/10 to-transparent border-destructive/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Expenses</p>
                    <p className="text-2xl font-bold text-destructive">
                      -{totalExpenses.toLocaleString('hu-HU')} Ft
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${netFlow >= 0 ? 'from-primary/10 border-primary/20' : 'from-destructive/10 border-destructive/20'} to-transparent`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Flow</p>
                    <p className={`text-2xl font-bold ${netFlow >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {netFlow >= 0 ? '+' : ''}{netFlow.toLocaleString('hu-HU')} Ft
                    </p>
                  </div>
                  <div className={`h-10 w-10 rounded-xl ${netFlow >= 0 ? 'bg-primary/10' : 'bg-destructive/10'} flex items-center justify-center`}>
                    {netFlow >= 0 ? (
                      <ArrowUpRight className="h-5 w-5 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Net Worth Trend Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Net Worth Trend</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {netWorthTrendData.length > 1 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={netWorthTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-card border border-border rounded-lg p-3 shadow-xl">
                                  <p className="text-xs text-muted-foreground mb-2">{label}</p>
                                  <p className="text-sm font-medium text-primary">
                                    Balance: {(payload[0].value as number).toLocaleString('hu-HU')} Ft
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
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    Need more data points to show trend
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Income Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <CardTitle className="text-base">Income</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {incomeExpenseBarData.some(d => d.income > 0) ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeExpenseBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis 
                          dataKey="label" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-card border border-border rounded-lg p-3 shadow-xl">
                                  <p className="text-xs text-muted-foreground mb-2">{label}</p>
                                  <p className="text-sm font-medium text-success">
                                    +{(payload[0].value as number).toLocaleString('hu-HU')} Ft
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Bar dataKey="income" name="Income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No income data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expenses Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <CardTitle className="text-base">Expenses</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {incomeExpenseBarData.some(d => d.expenses > 0) ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeExpenseBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis 
                          dataKey="label" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-card border border-border rounded-lg p-3 shadow-xl">
                                  <p className="text-xs text-muted-foreground mb-2">{label}</p>
                                  <p className="text-sm font-medium text-destructive">
                                    -{(payload[0].value as number).toLocaleString('hu-HU')} Ft
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No expense data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per-Account Net Worth Trends */}
            {perAccountTrendData.map(({ account, data }, index) => (
              <Card key={account.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{account.icon || '💳'}</span>
                    <CardTitle className="text-base">{account.name}</CardTitle>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {account.balance.toLocaleString('hu-HU')} Ft
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {data.length > 1 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-card border border-border rounded-lg p-3 shadow-xl">
                                    <p className="text-xs text-muted-foreground mb-2">{label}</p>
                                    <p className="text-sm font-medium" style={{ color: COLORS[index % COLORS.length] }}>
                                      Balance: {(payload[0].value as number).toLocaleString('hu-HU')} Ft
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
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      Need more data points
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Category Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Spending by Category</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {categoryData.length > 0 ? (
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="h-48 w-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {categoryData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />

                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => `${value.toLocaleString('hu-HU')} Ft`}
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2 w-full">
                      {categoryData.slice(0, 5).map((cat, index) => (
                        <div key={cat.name} className="flex items-center gap-3">
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-lg">{cat.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{cat.name}</span>
                              <span className="text-sm text-muted-foreground">
                                {cat.value.toLocaleString('hu-HU')} Ft
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-500"
                                style={{ 
                                  width: `${cat.percentage}%`,
                                  backgroundColor: COLORS[index % COLORS.length]
                                }}
                              />
                            </div>
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
          </div>

          {/* Top Expenses */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Top Expenses</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredTransactions
                  .filter(t => t.amount < 0)
                  .sort((a, b) => a.amount - b.amount)
                  .slice(0, 5)
                  .map((tx) => {
                    const category = categories.find(c => c.id === tx.category_id)
                    return (
                      <div 
                        key={tx.id} 
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-sm">
                          {category?.icon || '📦'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description || category?.name || 'Uncategorized'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="text-sm font-bold text-destructive">
                          -{Math.abs(tx.amount).toLocaleString('hu-HU')} Ft
                        </div>
                      </div>
                    )
                  })}
                {filteredTransactions.filter(t => t.amount < 0).length === 0 && (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No expenses in this period
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
