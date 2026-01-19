import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles
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
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, subYears, startOfYear, endOfYear, isThisYear, startOfWeek, endOfWeek, addWeeks, addDays, differenceInDays } from 'date-fns'
import { usePrivacy } from '../context/PrivacyContext'
import { DateRangePicker } from './DateRangePicker'
import { API_BASE_URL } from '../config'
import { apiFetch } from '../config'

// Custom Dropdown Component
function CustomSelect({ 
  value, 
  onChange, 
  options,
  variant = 'default'
}: { 
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; icon?: string }[]
  variant?: 'default' | 'success' | 'destructive'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  
  const selectedOption = options.find(o => o.value === value)
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const variantStyles = {
    default: 'hover:bg-secondary/80 focus:ring-primary/50',
    success: 'hover:bg-success/10 focus:ring-success/50',
    destructive: 'hover:bg-destructive/10 focus:ring-destructive/50'
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-xs bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-foreground cursor-pointer transition-colors focus:outline-none focus:ring-2 ${variantStyles[variant]}`}
      >
        {selectedOption?.icon && <span>{selectedOption.icon}</span>}
        <span>{selectedOption?.label}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 left-auto top-full mt-1 z-50 min-w-[140px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in-0 zoom-in-95">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-secondary/50 transition-colors ${
                value === option.value ? 'text-foreground bg-secondary/30' : 'text-muted-foreground'
              }`}
            >
              {option.icon && <span>{option.icon}</span>}
              <span className="flex-1">{option.label}</span>
              {value === option.value && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  linked_transaction_id?: string
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
  currency: string
  icon?: string
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
}

type TimePeriod = 'thisYear' | 'lastYear' | 'allTime' | 'custom'

const COLORS = [
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#ef4444', // red
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#22c55e', // green
  '#eab308', // yellow
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#64748b', // slate
]

export function Analytics({ 
  transactions,
  categories,
  accounts,
  masterCurrency = 'HUF'
}: { 
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  masterCurrency?: string
}) {
  const [period, setPeriod] = useState<TimePeriod>('custom')
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string>('all')
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<string>('all')
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [customDateRange, setCustomDateRange] = useState({ 
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), 
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd') 
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  
  // Spending estimate state
  const [weekEstimate, setWeekEstimate] = useState<any>(null)
  const [monthEstimate, setMonthEstimate] = useState<any>(null)
  
  const { privacyMode } = usePrivacy()

  // Helper function to calculate Y-axis domain for charts
  const calculateYAxisDomain = (data: { balance: number }[]) => {
    if (data.length === 0) return [0, 100]
    
    const values = data.map(d => d.balance)
    const min = Math.min(...values)
    const max = Math.max(...values)
    
    // Add 25% padding above and below to show movement better
    const range = max - min
    const padding = range * 0.25
    
    // If the range is very small, use a minimum padding
    const minPadding = max * 0.1
    const actualPadding = Math.max(padding, minPadding)
    
    const domainMin = Math.max(0, min - actualPadding)
    const domainMax = max + actualPadding
    
    return [domainMin, domainMax]
  }

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

  // Convert amount to master currency
  const convertToMasterCurrency = (amount: number, accountId: string): number => {
    const account = accounts.find(a => a.id === accountId)
    if (!account || account.currency === masterCurrency) return amount
    
    const rate = exchangeRates[account.currency]
    if (!rate) return amount // Fallback to original if rate unavailable
    
    return amount / rate
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

  // Net Worth Trend data - shows total balance over time in master currency
  const netWorthTrendData = useMemo(() => {
    // Get current total balance in master currency
    const currentTotalBalance = accounts.reduce((sum, acc) => {
      const convertedBalance = convertToMasterCurrency(acc.balance, acc.id)
      return sum + convertedBalance
    }, 0)
    
    // Get all dates with transactions, sorted newest first
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
    // Group transactions by date and sum them (converted)
    const transactionsByDate: Record<string, number> = {}
    sortedTransactions.forEach(tx => {
      const convertedAmount = convertToMasterCurrency(tx.amount, tx.account_id)
      transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + convertedAmount
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
        
        // Filter by date range
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
      
      // Group transactions by date and sum them
      const transactionsByDate: Record<string, number> = {}
      accountTransactions.forEach(tx => {
        transactionsByDate[tx.date] = (transactionsByDate[tx.date] || 0) + tx.amount
      })
      
      // Calculate balance at end of each date (in account's currency, will convert later)
      const dateBalances: Record<string, number> = {}
      let runningBalance = account.balance
      
      const today = format(new Date(), 'yyyy-MM-dd')
      
      // Only add today's balance if it's within the date range
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
          balance: convertToMasterCurrency(balance, account.id)
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      
      return {
        account,
        data,
        hasTransactions: accountTransactions.length > 0
      }
    })
    .filter(({ hasTransactions }) => hasTransactions) // Only show accounts with transactions in the date range
  }, [accounts, transactions, period, exchangeRates, masterCurrency, customDateRange])

  // Get expense categories for filter
  const expenseCategories = useMemo(() => {
    return categories.filter(c => c.type === 'expense')
  }, [categories])

  // Get income categories for filter
  const incomeCategories = useMemo(() => {
    return categories.filter(c => c.type === 'income')
  }, [categories])

  // Income comparison data - weeks for month view, months for year/all view
  const incomeChartData = useMemo(() => {
    const data: { key: string; label: string; amount: number }[] = []
    const now = new Date()
    
    // For custom range that's 40 days or less, show weeks
    if (period === 'custom' && differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) <= 40) {
      const monthStart = new Date(customDateRange.startDate)
      const monthEnd = new Date(customDateRange.endDate)
      
      // Generate weeks for the month
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
      // For year views or all time, show months
      const maxMonths = period === 'allTime' ? 100 : 12
      
      // Find the earliest transaction date
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
        
        // Filter by period if needed
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

  // Expenses comparison data - weeks for month view, months for year/all view
  const expensesChartData = useMemo(() => {
    const data: { key: string; label: string; amount: number }[] = []
    const now = new Date()
    
    // For custom range that's 40 days or less, show weeks
    if (period === 'custom' && differenceInDays(new Date(customDateRange.endDate), new Date(customDateRange.startDate)) <= 40) {
      const monthStart = new Date(customDateRange.startDate)
      const monthEnd = new Date(customDateRange.endDate)
      
      // Generate weeks for the month
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
      // For year views or all time, show months
      const maxMonths = period === 'allTime' ? 100 : 12
      
      // Find the earliest transaction date
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
        
        // Filter by period if needed
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

  // Period labels
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
                    // Custom range: shift by the range length
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
                    // Reset to current month when switching to custom
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
                        
                        // Check if it's a complete month
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
                    // Custom range: shift by the range length
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
          {/* Summary Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="bg-gradient-to-br from-success/10 to-transparent border-success/20">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Income</p>
                    <p className={`text-lg sm:text-2xl font-bold text-success truncate ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : `+${totalIncome.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
                    </p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0 ml-2">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-destructive/10 to-transparent border-destructive/20">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Expenses</p>
                    <p className={`text-lg sm:text-2xl font-bold text-destructive truncate ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : `-${totalExpenses.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
                    </p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0 ml-2">
                    <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${netFlow >= 0 ? 'from-primary/10 border-primary/20' : 'from-destructive/10 border-destructive/20'} to-transparent`}>
              <CardContent className="p-4 sm:pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Net Flow</p>
                    <p className={`text-lg sm:text-2xl font-bold truncate ${netFlow >= 0 ? 'text-primary' : 'text-destructive'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                      {privacyMode === 'hidden' ? '••••••' : `${netFlow >= 0 ? '+' : ''}${netFlow.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
                    </p>
                  </div>
                  <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-xl ${netFlow >= 0 ? 'bg-primary/10' : 'bg-destructive/10'} flex items-center justify-center flex-shrink-0 ml-2`}>
                    {netFlow >= 0 ? (
                      <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Spending Estimates */}
          {(weekEstimate || monthEstimate) && (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              {/* Next Week Estimate */}
              {weekEstimate && (
                <Card className="border border-border/60 bg-gradient-to-b from-background/60 via-background/30 to-background/10">
                  <CardHeader className="pb-2 px-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <CardTitle className="text-sm sm:text-base">Next Week Estimate</CardTitle>
                        <span className="text-xs text-muted-foreground">Week {weekEstimate.week_of_month} of month</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <div className="space-y-3">
                      <div>
                        <p className={`text-2xl sm:text-3xl font-bold text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : `${weekEstimate.estimate_amount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-base sm:text-lg text-muted-foreground">{masterCurrency}</span>
                        </p>
                        <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span>Confidence: {weekEstimate.confidence_level}%</span>
                          </div>
                          {weekEstimate.current_period_actual > 0 && (
                            <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                              This week so far: {privacyMode === 'hidden' ? '••••' : weekEstimate.current_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                            </div>
                          )}
                          {weekEstimate.previous_period_actual > 0 && (
                            <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                              Last week: {privacyMode === 'hidden' ? '••••' : weekEstimate.previous_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Next Month Estimate */}
              {monthEstimate && (
                <Card className="border border-border/60 bg-gradient-to-b from-background/60 via-background/30 to-background/10">
                  <CardHeader className="pb-2 px-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <CardTitle className="text-sm sm:text-base">Next Month Estimate</CardTitle>
                        <span className="text-xs text-muted-foreground">Based on historical patterns</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <div className="space-y-3">
                      <div>
                        <p className={`text-2xl sm:text-3xl font-bold text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : `${monthEstimate.estimate_amount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-base sm:text-lg text-muted-foreground">{masterCurrency}</span>
                        </p>
                        <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span>Confidence: {monthEstimate.confidence_level}%</span>
                          </div>
                          {monthEstimate.current_period_actual > 0 && (
                            <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                              This month so far: {privacyMode === 'hidden' ? '••••' : monthEstimate.current_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                            </div>
                          )}
                          {monthEstimate.previous_period_actual > 0 && (
                            <div className={privacyMode === 'hidden' ? 'select-none' : ''}>
                              Last month: {privacyMode === 'hidden' ? '••••' : monthEstimate.previous_period_actual.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Net Worth Trend Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm sm:text-base">Net Worth Trend</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {netWorthTrendData.length > 1 ? (
                  <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={netWorthTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                          domain={calculateYAxisDomain(netWorthTrendData)}
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
                                <div className="bg-card border border-border rounded-lg p-2 sm:p-3 shadow-xl text-xs sm:text-sm">
                                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                  <p className={`font-medium text-primary ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                    {privacyMode === 'hidden' ? '••••••' : (payload[0].value as number).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
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

            {/* Monthly Income Comparison */}
            <Card>
              <CardHeader className="pb-2 px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <CardTitle className="text-sm sm:text-base">Income</CardTitle>
                  </div>
                  <CustomSelect
                    value={selectedIncomeCategory}
                    onChange={setSelectedIncomeCategory}
                    variant="success"
                    options={[
                      { value: 'all', label: 'All', icon: '📊' },
                      ...incomeCategories.map(cat => ({
                        value: cat.id,
                        label: cat.name,
                        icon: cat.icon
                      }))
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {incomeChartData.some(d => d.amount > 0) ? (
                  <div className="h-40 sm:h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                              const currentIndex = incomeChartData.findIndex(d => d.label === label)
                              const prevPeriod = currentIndex > 0 ? incomeChartData[currentIndex - 1] : null
                              const currentAmount = payload[0].value as number
                              const diff = prevPeriod ? currentAmount - prevPeriod.amount : 0
                              const diffPercent = prevPeriod && prevPeriod.amount > 0 
                                ? ((currentAmount - prevPeriod.amount) / prevPeriod.amount * 100).toFixed(1)
                                : null
                              
                              return (
                                <div className="bg-card border border-border rounded-lg p-2 sm:p-3 shadow-xl text-xs sm:text-sm">
                                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                  <p className={`font-medium text-success ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                    {privacyMode === 'hidden' ? '+••••••' : `+${currentAmount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} {masterCurrency}
                                  </p>
                                  {prevPeriod && (
                                    <p className={`text-xs mt-1 ${diff >= 0 ? 'text-success' : 'text-destructive'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                      {privacyMode === 'hidden' ? '••••' : `${diff >= 0 ? '↑' : '↓'} ${Math.abs(diff).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}${diffPercent ? ` (${diff >= 0 ? '+' : ''}${diffPercent}%)` : ''}`}
                                    </p>
                                  )}
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Bar dataKey="amount" name="Income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-40 sm:h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No income data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Expenses Comparison with Category Filter */}
            <Card>
              <CardHeader className="pb-2 px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <CardTitle className="text-sm sm:text-base">Expenses</CardTitle>
                  </div>
                  <CustomSelect
                    value={selectedExpenseCategory}
                    onChange={setSelectedExpenseCategory}
                    variant="destructive"
                    options={[
                      { value: 'all', label: 'All', icon: '📊' },
                      ...expenseCategories.map(cat => ({
                        value: cat.id,
                        label: cat.name,
                        icon: cat.icon
                      }))
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {expensesChartData.some(d => d.amount > 0) ? (
                  <div className="h-40 sm:h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expensesChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                              const currentIndex = expensesChartData.findIndex(d => d.label === label)
                              const prevPeriod = currentIndex > 0 ? expensesChartData[currentIndex - 1] : null
                              const currentAmount = payload[0].value as number
                              const diff = prevPeriod ? currentAmount - prevPeriod.amount : 0
                              const diffPercent = prevPeriod && prevPeriod.amount > 0 
                                ? ((currentAmount - prevPeriod.amount) / prevPeriod.amount * 100).toFixed(1)
                                : null
                              
                              return (
                                <div className="bg-card border border-border rounded-lg p-2 sm:p-3 shadow-xl text-xs sm:text-sm">
                                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                  <p className={`font-medium text-destructive ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                    {privacyMode === 'hidden' ? '-••••••' : `-${currentAmount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} {masterCurrency}
                                  </p>
                                  {prevPeriod && (
                                    <p className={`text-xs mt-1 ${diff <= 0 ? 'text-success' : 'text-destructive'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                      {privacyMode === 'hidden' ? '••••' : `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}${diffPercent ? ` (${diff > 0 ? '+' : ''}${diffPercent}%)` : ''}`}
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

            {/* Per-Account Net Worth Trends */}
            {perAccountTrendData.map(({ account, data }, index) => (
              <Card key={account.id}>
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
                                  <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                    <p className={`font-medium ${privacyMode === 'hidden' ? 'select-none' : ''}`} style={{ color: COLORS[index % COLORS.length] }}>
                                      {privacyMode === 'hidden' ? '••••••' : (payload[0].value as number).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
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
            ))}

            {/* Category Breakdown */}
            <Card>
              <CardHeader className="pb-2 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm sm:text-base">Spending by Category</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {categoryData.length > 0 ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-40 w-40 sm:h-48 sm:w-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {categoryData.map((_, index) => (
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
                      {categoryData.slice(0, 5).map((cat, index) => (
                        <div key={cat.name} className="flex items-center gap-2 sm:gap-3">
                          <div 
                            className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-base sm:text-lg flex-shrink-0">{cat.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium truncate">{cat.name}</span>
                              <span className={`text-xs sm:text-sm text-muted-foreground flex-shrink-0 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                                {privacyMode === 'hidden' ? '••••••' : cat.value.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {masterCurrency}
                              </span>
                            </div>
                            <div className="mt-1 h-1 sm:h-1.5 rounded-full bg-secondary overflow-hidden">
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
            <CardHeader className="pb-2 px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm sm:text-base">Top Expenses</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <div className="space-y-2 sm:space-y-3">
                {filteredTransactions
                  .filter(t => t.amount < 0 && !t.linked_transaction_id)
                  .sort((a, b) => {
                    const aConverted = Math.abs(convertToMasterCurrency(a.amount, a.account_id))
                    const bConverted = Math.abs(convertToMasterCurrency(b.amount, b.account_id))
                    return bConverted - aConverted
                  })
                  .slice(0, 5)
                  .map((tx) => {
                    const category = categories.find(c => c.id === tx.category_id)
                    const convertedAmount = Math.abs(convertToMasterCurrency(tx.amount, tx.account_id))
                    return (
                      <div 
                        key={tx.id} 
                        className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-secondary flex items-center justify-center text-sm flex-shrink-0">
                          {category?.icon || '📦'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium truncate">
                            {tx.description || category?.name || 'Uncategorized'}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {format(new Date(tx.date), 'MMM d')}
                          </p>
                        </div>
                        <div className={`text-xs sm:text-sm font-bold text-destructive flex-shrink-0 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '-••••••' : `-${convertedAmount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                        </div>
                      </div>
                    )
                  })}
                {filteredTransactions.filter(t => t.amount < 0 && !t.linked_transaction_id).length === 0 && (
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
