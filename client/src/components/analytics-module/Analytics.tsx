import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '../common/card'
import { Button } from '../common/button'
import { BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, subYears, startOfYear, endOfYear, isThisYear, startOfWeek, endOfWeek, addWeeks, addDays, differenceInDays } from 'date-fns'
import { DateRangePicker } from '../common/DateRangePicker'
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
import type { Transaction, Category, Account, TimePeriod, SpendingEstimate, ChartDataPoint, TrendDataPoint } from './types'

type AnalyticsProps = {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  masterCurrency?: string
}

export function Analytics({ 
  transactions,
  categories,
  accounts,
  masterCurrency = 'HUF'
}: AnalyticsProps) {
  const [period, setPeriod] = useState<TimePeriod>('custom')
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string>('all')
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<string>('all')
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [customDateRange, setCustomDateRange] = useState({ 
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), 
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd') 
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [weekEstimate, setWeekEstimate] = useState<SpendingEstimate | null>(null)
  const [monthEstimate, setMonthEstimate] = useState<SpendingEstimate | null>(null)

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
    const now = new Date()
    
    return transactions.filter(tx => {
      const txDate = new Date(tx.date)
      const account = accounts.find(a => a.id === tx.account_id)
      
      // Exclude investment account transactions
      if (account?.type === 'investment') return false
      
      switch (period) {
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
        case 'custom':
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

  // Net Worth Trend data - shows total balance over time in master currency
  const netWorthTrendData = useMemo((): TrendDataPoint[] => {
    const currentTotalBalance = accounts.reduce((sum, acc) => {
      const convertedBalance = convertToMasterCurrency(acc.balance, acc.id)
      return sum + convertedBalance
    }, 0)
    
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
    const transactionsByDate: Record<string, number> = {}
    sortedTransactions.forEach(tx => {
      const convertedAmount = convertToMasterCurrency(tx.amount, tx.account_id)
      transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + convertedAmount
    })
    
    const dateBalances: Record<string, number> = {}
    let runningBalance = currentTotalBalance
    
    const today = format(new Date(), 'yyyy-MM-dd')
    dateBalances[today] = currentTotalBalance
    
    const uniqueDates = Object.keys(transactionsByDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )
    
    uniqueDates.forEach(date => {
      dateBalances[date] = runningBalance
      runningBalance -= transactionsByDate[date]
    })
    
    return Object.entries(dateBalances)
      .map(([date, balance]) => ({
        date,
        formattedDate: format(new Date(date), 'MMM d'),
        balance
      }))
      .filter(d => {
        const txDate = new Date(d.date)
        switch (period) {
          case 'thisYear':
            return isThisYear(txDate)
          case 'lastYear':
            const lastYear = new Date().getFullYear() - 1
            return txDate.getFullYear() === lastYear
          case 'custom':
            return isWithinInterval(txDate, {
              start: new Date(customDateRange.startDate),
              end: new Date(customDateRange.endDate)
            })
          default:
            return true
        }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
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
            case 'thisYear':
              return isThisYear(txDate)
            case 'lastYear':
              const lastYear = new Date().getFullYear() - 1
              return txDate.getFullYear() === lastYear
            case 'custom':
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
            case 'thisYear':
              return isThisYear(todayDate)
            case 'lastYear':
              const lastYear = new Date().getFullYear() - 1
              return todayDate.getFullYear() === lastYear
            case 'custom':
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
        
        const data: TrendDataPoint[] = Object.entries(dateBalances)
          .map(([date, balance]) => ({
            date,
            formattedDate: format(new Date(date), 'MMM d'),
            balance: convertToMasterCurrency(balance, account.id)
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        
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
    
    if (period === 'custom' && differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) <= 40) {
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
        
        if (period === 'thisYear' && !isThisYear(monthDate)) continue
        if (period === 'lastYear' && monthDate.getFullYear() !== now.getFullYear() - 1) continue
        if (period === 'custom' && !isWithinInterval(monthDate, { start: new Date(customDateRange.startDate), end: new Date(customDateRange.endDate) })) continue
        
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
    
    if (period === 'custom' && differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) <= 40) {
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
        
        if (period === 'thisYear' && !isThisYear(monthDate)) continue
        if (period === 'lastYear' && monthDate.getFullYear() !== now.getFullYear() - 1) continue
        if (period === 'custom' && !isWithinInterval(monthDate, { start: new Date(customDateRange.startDate), end: new Date(customDateRange.endDate) })) continue
        
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
    thisYear: 'This Year',
    lastYear: 'Last Year',
    allTime: 'All Time',
    custom: 'Custom'
  }

  const hasData = filteredTransactions.length > 0

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Analytics</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 w-full sm:w-auto">
          <div className="relative">
            <div className="flex items-center gap-1 sm:gap-2">
              {period === 'custom' && (
                <Button
                  onClick={() => {
                    const rangeDays = differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) + 1
                    const newStart = format(addDays(new Date(customDateRange.startDate), -rangeDays), 'yyyy-MM-dd')
                    const newEnd = format(addDays(new Date(customDateRange.endDate), -rangeDays), 'yyyy-MM-dd')
                    setCustomDateRange({ startDate: newStart, endDate: newEnd })
                  }}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              )}
              <button
                onClick={() => {
                  if (period === 'custom') {
                    setShowDatePicker(!showDatePicker)
                  } else {
                    const now = new Date()
                    setCustomDateRange({
                      startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
                      endDate: format(endOfMonth(now), 'yyyy-MM-dd')
                    })
                    setPeriod('custom')
                    setShowDatePicker(true)
                  }
                }}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md border transition-colors ${
                  period === 'custom'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary/50 border-border/50 hover:bg-secondary/70'
                }`}
              >
                <Calendar className="h-3 w-3 text-current" />
                <span className="text-[11px] sm:text-xs font-medium">
                  {period === 'custom' 
                    ? (() => {
                        const start = new Date(customDateRange.startDate)
                        const end = new Date(customDateRange.endDate)
                        const monthStart = startOfMonth(start)
                        const monthEnd = endOfMonth(start)
                        
                        if (format(start, 'yyyy-MM-dd') === format(monthStart, 'yyyy-MM-dd') &&
                            format(end, 'yyyy-MM-dd') === format(monthEnd, 'yyyy-MM-dd')) {
                          return format(start, 'MMMM yyyy')
                        }
                        return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`
                      })()
                    : 'Custom'
                  }
                </span>
              </button>
              {period === 'custom' && (
                <Button
                  onClick={() => {
                    const rangeDays = differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) + 1
                    const newStart = format(addDays(new Date(customDateRange.startDate), rangeDays), 'yyyy-MM-dd')
                    const newEnd = format(addDays(new Date(customDateRange.endDate), rangeDays), 'yyyy-MM-dd')
                    setCustomDateRange({ startDate: newStart, endDate: newEnd })
                  }}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                >
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              )}
            </div>
            {showDatePicker && (
              <DateRangePicker
                startDate={customDateRange.startDate}
                endDate={customDateRange.endDate}
                onApply={(range) => {
                  setCustomDateRange(range)
                  setPeriod('custom')
                  setShowDatePicker(false)
                }}
                onCancel={() => setShowDatePicker(false)}
              />
            )}
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-secondary/50 border border-border/50 w-full sm:w-auto">
            {(Object.keys(periodLabels).filter(p => p !== 'custom') as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  period === p
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {p === 'thisYear' ? '2026' : p === 'lastYear' ? '2025' : 'All Time'}
              </button>
            ))}
          </div>
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
          <SummaryCards 
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            netFlow={netFlow}
            masterCurrency={masterCurrency}
          />

          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <NetWorthTrendChart 
              data={netWorthTrendData}
              masterCurrency={masterCurrency}
            />

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
