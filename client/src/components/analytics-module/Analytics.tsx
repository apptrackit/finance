import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '../common/card'
import { Button } from '../common/button'
import { BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isWithinInterval, subYears, addYears, startOfYear, endOfYear, startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { API_BASE_URL, apiFetch } from '../../config'
import { convertToMasterCurrency as convertUtil } from './utils'
import { SummaryCards } from './SummaryCards'
import { SpendingEstimates } from './SpendingEstimates'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { IncomeChart } from './IncomeChart'
import { ExpensesChart } from './ExpensesChart'
import { PerAccountTrendChart } from './PerAccountTrendChart'
import { CategoryBreakdownChart } from './CategoryBreakdownChart'
import { IncomeBreakdownChart } from './IncomeBreakdownChart'
import { TopExpensesList } from './TopExpensesList'
import { PredictionChart } from './PredictionChart'
import type { Transaction, Category, Account, TimePeriod, SpendingEstimate, ChartDataPoint, TrendDataPoint } from './types'

type AnalyticsProps = {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  masterCurrency?: string
  loading?: boolean
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted" />
          <div className="h-5 w-24 rounded bg-muted" />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-border/40 w-full sm:w-64 h-9" />
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[0,1,2].map(i => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-7 w-24 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
      {/* Chart grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-48 w-full rounded-lg bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Analytics({
  transactions,
  categories,
  accounts,
  masterCurrency = 'HUF',
  loading = false
}: AnalyticsProps) {
  const [period, setPeriod] = useState<TimePeriod>('month')
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string>('all')
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<string>('all')
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState(new Date())

  const customDateRange = useMemo(() => {
    if (period === 'month') {
      return {
        startDate: format(startOfMonth(selectedDate), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(selectedDate), 'yyyy-MM-dd')
      }
    }
    if (period === 'year') {
      return {
        startDate: format(startOfYear(selectedDate), 'yyyy-MM-dd'),
        endDate: format(endOfYear(selectedDate), 'yyyy-MM-dd')
      }
    }
    return { startDate: '2000-01-01', endDate: format(new Date(), 'yyyy-MM-dd') }
  }, [period, selectedDate])
  const [weekEstimate, setWeekEstimate] = useState<SpendingEstimate | null>(null)
  const [monthEstimate, setMonthEstimate] = useState<SpendingEstimate | null>(null)

  // Show prediction chart only when on default current-month view
  const isCurrentMonthView = useMemo(() => {
    if (period !== 'month') return false
    const now = new Date()
    return selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear()
  }, [period, selectedDate])

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
        const data = await response.json()
        if (data.rates) {
          setExchangeRates(data.rates)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error)
      }
    }
    fetchRates()
  }, [masterCurrency])

  // Fetch spending estimates
  useEffect(() => {
    const fetchEstimates = async () => {
      try {
        const [weekRes, monthRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/dashboard/spending-estimate?period=week&currency=${masterCurrency}`),
          apiFetch(`${API_BASE_URL}/dashboard/spending-estimate?period=month&currency=${masterCurrency}`)
        ])
        
        if (weekRes.ok) {
          const weekData = await weekRes.json()
          setWeekEstimate(weekData)
        }
        
        if (monthRes.ok) {
          const monthData = await monthRes.json()
          setMonthEstimate(monthData)
        }
      } catch (error) {
        console.error('Failed to fetch spending estimates:', error)
      }
    }
    
    fetchEstimates()
  }, [masterCurrency])

  // Wrapper for convertToMasterCurrency utility
  const convertToMasterCurrency = (amount: number, accountId: string): number => {
    return convertUtil(amount, accountId, accounts, exchangeRates, masterCurrency)
  }

  // Filter transactions by period (exclude investment accounts only)
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date)
      const account = accounts.find(a => a.id === tx.account_id)
      
      // Exclude investment account transactions
      if (account?.type === 'investment') return false
      
      switch (period) {
        case 'month':
        case 'year':
          return isWithinInterval(txDate, {
            start: new Date(customDateRange.startDate),
            end: new Date(customDateRange.endDate)
          })
        case 'allTime':
        default:
          return true
      }
    })
  }, [transactions, period, accounts, customDateRange])

  // Calculate totals in master currency
  const { totalIncome, totalExpenses, netFlow } = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.amount > 0 && !t.linked_transaction_id)
      .reduce((sum, t) => sum + convertToMasterCurrency(t.amount, t.account_id), 0)
    const expenses = filteredTransactions
      .filter(t => t.amount < 0 && !t.linked_transaction_id)
      .reduce((sum, t) => sum + Math.abs(convertToMasterCurrency(t.amount, t.account_id)), 0)
    return {
      totalIncome: income,
      totalExpenses: expenses,
      netFlow: income - expenses
    }
  }, [filteredTransactions, exchangeRates, accounts, masterCurrency])

  // Spending by category data in master currency
  const categoryData = useMemo(() => {
    const expensesByCategory: Record<string, number> = {}
    
    filteredTransactions
      .filter(t => t.amount < 0 && !t.linked_transaction_id)
      .forEach(t => {
        const categoryId = t.category_id || 'uncategorized'
        const convertedAmount = Math.abs(convertToMasterCurrency(t.amount, t.account_id))
        expensesByCategory[categoryId] = (expensesByCategory[categoryId] || 0) + convertedAmount
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
  }, [filteredTransactions, categories, totalExpenses, exchangeRates, accounts, masterCurrency])

  // Income by category data in master currency
  const incomeCategoryData = useMemo(() => {
    const incomeByCategory: Record<string, number> = {}
    
    filteredTransactions
      .filter(t => t.amount > 0 && !t.linked_transaction_id)
      .forEach(t => {
        const categoryId = t.category_id || 'uncategorized'
        const convertedAmount = convertToMasterCurrency(t.amount, t.account_id)
        incomeByCategory[categoryId] = (incomeByCategory[categoryId] || 0) + convertedAmount
      })

    return Object.entries(incomeByCategory)
      .map(([categoryId, amount]) => {
        const category = categories.find(c => c.id === categoryId)
        return {
          name: category?.name || 'Other',
          icon: category?.icon || '📦',
          value: amount,
          percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [filteredTransactions, categories, totalIncome, exchangeRates, accounts, masterCurrency])

  // Cash Balance Trend data - only cash accounts (excludes investment and exclude_from_net_worth)
  const cashBalanceTrendData = useMemo((): TrendDataPoint[] => {
    const cashAccounts = accounts.filter(
      acc => acc.type !== 'investment' && !acc.exclude_from_net_worth
    )
    const cashAccountIds = new Set(cashAccounts.map(a => a.id))

    const currentCashBalance = cashAccounts.reduce((sum, acc) => {
      return sum + convertToMasterCurrency(acc.balance, acc.id)
    }, 0)

    const sortedTransactions = [...transactions]
      .filter(tx => cashAccountIds.has(tx.account_id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const transactionsByDate: Record<string, number> = {}
    sortedTransactions.forEach(tx => {
      const convertedAmount = convertToMasterCurrency(tx.amount, tx.account_id)
      transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + convertedAmount
    })

    const dateBalances: Record<string, number> = {}
    let runningBalance = currentCashBalance

    const today = format(new Date(), 'yyyy-MM-dd')
    dateBalances[today] = currentCashBalance

    const uniqueDates = Object.keys(transactionsByDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )

    uniqueDates.forEach(date => {
      dateBalances[date] = runningBalance
      runningBalance -= transactionsByDate[date]
    })

    const rawData = Object.entries(dateBalances)
      .map(([date, balance]) => ({
        date,
        formattedDate: format(new Date(date), 'MMM d'),
        balance
      }))
      .filter(d => {
        const txDate = new Date(d.date)
        switch (period) {
          case 'month':
          case 'year':
            return isWithinInterval(txDate, {
              start: new Date(customDateRange.startDate),
              end: new Date(customDateRange.endDate)
            })
          default:
            return true
        }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate EMA (Exponential Moving Average) as a smoothed baseline
    if (rawData.length === 0) return rawData
    const span = Math.max(3, Math.min(Math.round(rawData.length * 0.3), 20))
    const k = 2 / (span + 1)
    let ema = rawData[0].balance
    return rawData.map((point, i) => {
      if (i === 0) return { ...point, smoothed: ema }
      ema = point.balance * k + ema * (1 - k)
      return { ...point, smoothed: ema }
    })
  }, [transactions, accounts, period, exchangeRates, masterCurrency, customDateRange])

  // Per-account Net Worth Trend data in master currency (exclude investment accounts)
  const perAccountTrendData = useMemo(() => {
    return accounts
      .filter(account => account.type !== 'investment')
      .map(account => {
        const accountTransactions = transactions.filter(t => {
          const txDate = new Date(t.date)
          const matchesAccount = t.account_id === account.id
          if (!matchesAccount) return false
          
          switch (period) {
            case 'month':
            case 'year':
              return isWithinInterval(txDate, {
                start: new Date(customDateRange.startDate),
                end: new Date(customDateRange.endDate)
              })
            default:
              return true
          }
        })
        
        const transactionsByDate: Record<string, number> = {}
        accountTransactions.forEach(tx => {
          transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + tx.amount
        })
        
        const dateBalances: Record<string, number> = {}
        let runningBalance = account.balance
        
        const today = format(new Date(), 'yyyy-MM-dd')
        
        const todayInRange = (() => {
          const todayDate = new Date(today)
          switch (period) {
            case 'month':
            case 'year':
              return isWithinInterval(todayDate, {
                start: new Date(customDateRange.startDate),
                end: new Date(customDateRange.endDate)
              })
            default:
              return true
          }
        })()
        
        if (todayInRange) {
          dateBalances[today] = account.balance
        }
        
        const uniqueDates = Object.keys(transactionsByDate).sort(
          (a, b) => new Date(b).getTime() - new Date(a).getTime()
        )
        
        uniqueDates.forEach(date => {
          dateBalances[date] = runningBalance
          runningBalance -= transactionsByDate[date]
        })
        
        const rawData: TrendDataPoint[] = Object.entries(dateBalances)
          .map(([date, balance]) => ({
            date,
            formattedDate: format(new Date(date), 'MMM d'),
            balance: convertToMasterCurrency(balance, account.id)
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        // Calculate EMA (Exponential Moving Average) as a smoothed baseline
        let data = rawData
        if (rawData.length > 0) {
          const span = Math.max(3, Math.min(Math.round(rawData.length * 0.3), 20))
          const k = 2 / (span + 1)
          let ema = rawData[0].balance
          data = rawData.map((point, i) => {
            if (i === 0) return { ...point, smoothed: ema }
            ema = point.balance * k + ema * (1 - k)
            return { ...point, smoothed: ema }
          })
        }

        return {
          account,
          data,
          hasTransactions: accountTransactions.length > 0
        }
      })
      .filter(({ hasTransactions }) => hasTransactions)
  }, [accounts, transactions, period, exchangeRates, masterCurrency, customDateRange])

  // Get expense categories for filter
  const expenseCategories = useMemo(() => {
    return categories.filter(c => c.type === 'expense')
  }, [categories])

  // Get income categories for filter
  const incomeCategories = useMemo(() => {
    return categories.filter(c => c.type === 'income')
  }, [categories])

  // Income comparison data
  const incomeChartData = useMemo((): ChartDataPoint[] => {
    const data: ChartDataPoint[] = []
    const now = new Date()
    
    if (period === 'month') {
      const monthStart = new Date(customDateRange.startDate)
      const monthEnd = new Date(customDateRange.endDate)
      
      let weekStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      let weekNum = 1
      
      while (weekStart <= monthEnd) {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        const weekKey = format(weekStart, 'yyyy-MM-dd')
        
        const weekIncome = transactions
          .filter(tx => {
            const account = accounts.find(a => a.id === tx.account_id)
            if (account?.type === 'investment') return false
            const txDate = new Date(tx.date)
            const inDateRange = tx.amount > 0 && !tx.linked_transaction_id && isWithinInterval(txDate, { 
              start: weekStart < monthStart ? monthStart : weekStart, 
              end: weekEnd > monthEnd ? monthEnd : weekEnd 
            })
            if (!inDateRange) return false
            if (selectedIncomeCategory === 'all') return true
            return tx.category_id === selectedIncomeCategory
          })
          .reduce((sum, tx) => sum + convertToMasterCurrency(tx.amount, tx.account_id), 0)
        
        data.push({
          key: weekKey,
          label: `Week ${weekNum}`,
          amount: weekIncome
        })
        
        weekStart = addWeeks(weekStart, 1)
        weekNum++
      }
    } else {
      const maxMonths = period === 'allTime' ? 100 : 12
      
      const incomeTransactions = transactions.filter(tx => {
        const account = accounts.find(a => a.id === tx.account_id)
        if (account?.type === 'investment') return false
        if (tx.amount <= 0) return false
        if (selectedIncomeCategory === 'all') return true
        return tx.category_id === selectedIncomeCategory
      })
      
      if (incomeTransactions.length === 0) return data
      
      const earliestDate = incomeTransactions.reduce((earliest, tx) => {
        const txDate = new Date(tx.date)
        return txDate < earliest ? txDate : earliest
      }, new Date())
      
      const monthsToShow = Math.min(
        maxMonths,
        Math.ceil((now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1
      )
      
      for (let i = monthsToShow - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i)
        const monthStart = startOfMonth(monthDate)
        const monthEnd = endOfMonth(monthDate)
        const monthKey = format(monthDate, 'yyyy-MM')
        
        if (period === 'year' && !isWithinInterval(monthDate, { start: new Date(customDateRange.startDate), end: new Date(customDateRange.endDate) })) continue
        
        const monthIncome = transactions
          .filter(tx => {
            const account = accounts.find(a => a.id === tx.account_id)
            if (account?.type === 'investment') return false
            const txDate = new Date(tx.date)
            const inDateRange = tx.amount > 0 && !tx.linked_transaction_id && isWithinInterval(txDate, { start: monthStart, end: monthEnd })
            if (!inDateRange) return false
            if (selectedIncomeCategory === 'all') return true
            return tx.category_id === selectedIncomeCategory
          })
          .reduce((sum, tx) => sum + convertToMasterCurrency(tx.amount, tx.account_id), 0)
        
        data.push({
          key: monthKey,
          label: format(monthDate, 'MMM'),
          amount: monthIncome
        })
      }
    }
    
    return data
  }, [transactions, selectedIncomeCategory, period, customDateRange, accounts, exchangeRates, masterCurrency])

  // Expenses comparison data
  const expensesChartData = useMemo((): ChartDataPoint[] => {
    const data: ChartDataPoint[] = []
    const now = new Date()
    
    if (period === 'month') {
      const monthStart = new Date(customDateRange.startDate)
      const monthEnd = new Date(customDateRange.endDate)
      
      let weekStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      let weekNum = 1
      
      while (weekStart <= monthEnd) {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        const weekKey = format(weekStart, 'yyyy-MM-dd')
        
        const weekExpenses = transactions
          .filter(tx => {
            const account = accounts.find(a => a.id === tx.account_id)
            if (account?.type === 'investment') return false
            const txDate = new Date(tx.date)
            const inDateRange = tx.amount < 0 && !tx.linked_transaction_id && isWithinInterval(txDate, { 
              start: weekStart < monthStart ? monthStart : weekStart, 
              end: weekEnd > monthEnd ? monthEnd : weekEnd 
            })
            if (!inDateRange) return false
            if (selectedExpenseCategory === 'all') return true
            return tx.category_id === selectedExpenseCategory
          })
          .reduce((sum, tx) => sum + Math.abs(convertToMasterCurrency(tx.amount, tx.account_id)), 0)
        
        data.push({
          key: weekKey,
          label: `Week ${weekNum}`,
          amount: weekExpenses
        })
        
        weekStart = addWeeks(weekStart, 1)
        weekNum++
      }
    } else {
      const maxMonths = period === 'allTime' ? 100 : 12
      
      const expenseTransactions = transactions.filter(tx => {
        const account = accounts.find(a => a.id === tx.account_id)
        if (account?.type === 'investment') return false
        if (tx.amount >= 0) return false
        if (selectedExpenseCategory === 'all') return true
        return tx.category_id === selectedExpenseCategory
      })
      
      if (expenseTransactions.length === 0) return data
      
      const earliestDate = expenseTransactions.reduce((earliest, tx) => {
        const txDate = new Date(tx.date)
        return txDate < earliest ? txDate : earliest
      }, new Date())
      
      const monthsToShow = Math.min(
        maxMonths,
        Math.ceil((now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1
      )
      
      for (let i = monthsToShow - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i)
        const monthStart = startOfMonth(monthDate)
        const monthEnd = endOfMonth(monthDate)
        const monthKey = format(monthDate, 'yyyy-MM')
        
        if (period === 'year' && !isWithinInterval(monthDate, { start: new Date(customDateRange.startDate), end: new Date(customDateRange.endDate) })) continue
        
        const monthExpenses = transactions
          .filter(tx => {
            const account = accounts.find(a => a.id === tx.account_id)
            if (account?.type === 'investment') return false
            const txDate = new Date(tx.date)
            const inDateRange = tx.amount < 0 && !tx.linked_transaction_id && isWithinInterval(txDate, { start: monthStart, end: monthEnd })
            if (!inDateRange) return false
            if (selectedExpenseCategory === 'all') return true
            return tx.category_id === selectedExpenseCategory
          })
          .reduce((sum, tx) => sum + Math.abs(convertToMasterCurrency(tx.amount, tx.account_id)), 0)
        
        data.push({
          key: monthKey,
          label: format(monthDate, 'MMM'),
          amount: monthExpenses
        })
      }
    }
    
    return data
  }, [transactions, selectedExpenseCategory, period, customDateRange, accounts, exchangeRates, masterCurrency])

  const periodLabels: Record<TimePeriod, string> = {
    allTime: 'All Time',
    month: 'Month',
    year: 'Year'
  }

  const navigateBack = () => {
    setSelectedDate(d => period === 'month' ? subMonths(d, 1) : subYears(d, 1))
  }

  const navigateForward = () => {
    setSelectedDate(d => period === 'month' ? addMonths(d, 1) : addYears(d, 1))
  }

  const isSelectedInCurrentYear = selectedDate.getFullYear() === new Date().getFullYear()

  const periodDisplayLabel = period === 'month'
    ? format(selectedDate, isSelectedInCurrentYear ? 'MMMM' : 'MMMM yyyy')
    : period === 'year'
      ? format(selectedDate, 'yyyy')
      : 'All Time'

  const hasData = filteredTransactions.length > 0

  if (loading) return <AnalyticsSkeleton />

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Analytics</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <div className="flex gap-1 p-1 rounded-xl bg-background/80 border border-border/70 shadow-inner w-full sm:w-auto">
            {(Object.keys(periodLabels) as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  period === p
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
          {period !== 'allTime' && (
            <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/70 px-1 py-1 shadow-sm">
              <Button
                onClick={navigateBack}
                size="sm"
                variant="ghost"
                className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg hover:bg-secondary"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <span className="min-w-[130px] px-2 text-center text-xs sm:text-sm font-semibold select-none">
                {periodDisplayLabel}
              </span>
              <Button
                onClick={navigateForward}
                size="sm"
                variant="ghost"
                className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg hover:bg-secondary"
              >
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No transactions for {period === 'allTime' ? 'all time' : periodDisplayLabel.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add some transactions to see analytics</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards 
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            netFlow={netFlow}
            masterCurrency={masterCurrency}
          />

          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <NetWorthTrendChart 
              data={cashBalanceTrendData}
              masterCurrency={masterCurrency}
              title="Cash Balance Trend"
            />

            {isCurrentMonthView && (
              <PredictionChart
                transactions={transactions}
                accounts={accounts}
                masterCurrency={masterCurrency}
                exchangeRates={exchangeRates}
                convertToMasterCurrency={convertToMasterCurrency}
              />
            )}

            <IncomeChart 
              data={incomeChartData}
              selectedCategory={selectedIncomeCategory}
              onCategoryChange={setSelectedIncomeCategory}
              categories={incomeCategories}
              masterCurrency={masterCurrency}
            />

            <ExpensesChart 
              data={expensesChartData}
              selectedCategory={selectedExpenseCategory}
              onCategoryChange={setSelectedExpenseCategory}
              categories={expenseCategories}
              masterCurrency={masterCurrency}
            />

            {perAccountTrendData.map(({ account, data }, index) => (
              <PerAccountTrendChart
                key={account.id}
                account={account}
                data={data}
                index={index}
                masterCurrency={masterCurrency}
                convertToMasterCurrency={convertToMasterCurrency}
                className={perAccountTrendData.length % 2 !== 0 && index === perAccountTrendData.length - 1 ? 'lg:col-span-2' : ''}
              />
            ))}

            <IncomeBreakdownChart 
              data={incomeCategoryData}
              masterCurrency={masterCurrency}
            />

            <CategoryBreakdownChart 
              data={categoryData}
              masterCurrency={masterCurrency}
            />
          </div>

          <SpendingEstimates 
            weekEstimate={weekEstimate}
            monthEstimate={monthEstimate}
            masterCurrency={masterCurrency}
          />

          <TopExpensesList 
            transactions={filteredTransactions}
            categories={categories}
            masterCurrency={masterCurrency}
            convertToMasterCurrency={convertToMasterCurrency}
          />
        </>
      )}
    </div>
  )
}
