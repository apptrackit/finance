import { useState, useEffect } from 'react'
import { API_BASE_URL, apiFetch } from '../config'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Plus, Trash2, Edit2, Clock, TrendingDown, TrendingUp, AlertTriangle, Calendar, Wallet, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAlert } from '../context/AlertContext'
import { usePrivacy } from '../context/PrivacyContext'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type RecurringSchedule = {
  id: string
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  account_id: string
  to_account_id?: string
  category_id?: string
  amount: number
  amount_to?: number
  description?: string
  is_active: boolean
  created_at: number
  last_processed_date?: string
  remaining_occurrences?: number
  end_date?: string
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
]

export function RecurringTransactions({ 
  accounts, 
  categories 
}: { 
  accounts: Account[]
  categories: Category[]
}) {
  const { showAlert } = useAlert()
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [calendarDate, setCalendarDate] = useState(new Date())

  const [formData, setFormData] = useState({
    type: 'transaction' as 'transaction' | 'transfer',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly',
    day_of_week: 1,
    day_of_month: '1',
    account_id: '',
    to_account_id: '',
    category_id: '',
    amount: '',
    amount_to: '',
    description: '',
    transaction_type: 'expense' as 'expense' | 'income',
    limit_type: 'unlimited' as 'unlimited' | 'occurrences' | 'end_date',
    remaining_occurrences: '',
    end_date: ''
  })

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/recurring-schedules`)
      if (res.ok) {
        const data = await res.json()
        setSchedules(data)
      }
    } catch (error) {
      console.error('Failed to fetch recurring schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    // Find default subscription category for expenses
    const subscriptionCategory = expenseCategories.find(
      cat => cat.name.toLowerCase() === 'subscription'
    )
    
    setFormData({
      type: 'transaction',
      frequency: 'monthly',
      day_of_week: 1,
      day_of_month: '1',
      account_id: '',
      to_account_id: '',
      category_id: subscriptionCategory?.id || '',
      amount: '',
      amount_to: '',
      description: '',
      transaction_type: 'expense',
      limit_type: 'unlimited',
      remaining_occurrences: '',
      end_date: ''
    })
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = parseFloat(formData.amount.replace(/\s/g, ''))
    if (isNaN(amount) || amount <= 0) {
      showAlert({ type: 'error', message: 'Please enter a valid amount' })
      return
    }

    const payload: any = {
      type: formData.type,
      frequency: formData.frequency,
      account_id: formData.account_id,
      amount: formData.type === 'transaction' && formData.transaction_type === 'expense' 
        ? -Math.abs(amount) 
        : Math.abs(amount),
      description: formData.description || undefined
    }

    // Add frequency-specific fields
    if (formData.frequency === 'weekly') {
      payload.day_of_week = formData.day_of_week
    } else if (formData.frequency === 'monthly') {
      const dayOfMonth = parseInt(formData.day_of_month)
      if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
        payload.day_of_month = dayOfMonth
      } else {
        showAlert({ type: 'error', message: 'Please enter a valid day of month (1-31)' })
        return
      }
    }

    // Add type-specific fields
    if (formData.type === 'transaction') {
      payload.category_id = formData.category_id
    } else if (formData.type === 'transfer') {
      payload.to_account_id = formData.to_account_id
      if (formData.amount_to) {
        const amountTo = parseFloat(formData.amount_to.replace(/\s/g, ''))
        if (!isNaN(amountTo) && amountTo > 0) {
          payload.amount_to = amountTo
        }
      }
    }

    // Add limit fields
    if (formData.limit_type === 'occurrences' && formData.remaining_occurrences) {
      const occurrences = parseInt(formData.remaining_occurrences)
      if (!isNaN(occurrences) && occurrences > 0) {
        payload.remaining_occurrences = occurrences
      }
    } else if (formData.limit_type === 'end_date' && formData.end_date) {
      payload.end_date = formData.end_date
    }

    try {
      if (editingId) {
        const res = await apiFetch(`${API_BASE_URL}/recurring-schedules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (res.ok) {
          showAlert({ type: 'success', message: 'Recurring schedule updated successfully' })
          await fetchSchedules()
          resetForm()
        } else {
          const error = await res.json()
          showAlert({ type: 'error', message: error.error || 'Failed to update recurring schedule' })
        }
      } else {
        const res = await apiFetch(`${API_BASE_URL}/recurring-schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (res.ok) {
          showAlert({ type: 'success', message: 'Recurring schedule created successfully' })
          await fetchSchedules()
          resetForm()
        } else {
          const error = await res.json()
          showAlert({ type: 'error', message: error.error || 'Failed to create recurring schedule' })
        }
      }
    } catch (error) {
      showAlert({ type: 'error', message: 'An error occurred' })
      console.error(error)
    }
  }

  const handleEdit = (schedule: RecurringSchedule) => {
    // Determine limit_type based on existing data
    let limit_type: 'unlimited' | 'occurrences' | 'end_date' = 'unlimited'
    if (schedule.remaining_occurrences !== undefined) {
      limit_type = 'occurrences'
    } else if (schedule.end_date) {
      limit_type = 'end_date'
    }

    setFormData({
      type: schedule.type,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week ?? 1,
      day_of_month: schedule.day_of_month?.toString() ?? '1',
      account_id: schedule.account_id,
      to_account_id: schedule.to_account_id || '',
      category_id: schedule.category_id || '',
      amount: Math.abs(schedule.amount).toString(),
      amount_to: schedule.amount_to?.toString() || '',
      description: schedule.description || '',
      transaction_type: schedule.amount < 0 ? 'expense' : 'income',
      limit_type: limit_type,
      remaining_occurrences: schedule.remaining_occurrences?.toString() || '',
      end_date: schedule.end_date || ''
    })
    setEditingId(schedule.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recurring schedule?')) return

    try {
      const res = await apiFetch(`${API_BASE_URL}/recurring-schedules/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        showAlert({ type: 'success', message: 'Recurring schedule deleted successfully' })
        await fetchSchedules()
      } else {
        showAlert({ type: 'error', message: 'Failed to delete recurring schedule' })
      }
    } catch (error) {
      showAlert({ type: 'error', message: 'An error occurred' })
      console.error(error)
    }
  }

  const toggleActive = async (schedule: RecurringSchedule) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/recurring-schedules/${schedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !schedule.is_active })
      })
      if (res.ok) {
        showAlert({ type: 'success', message: `Recurring schedule ${!schedule.is_active ? 'activated' : 'deactivated'}` })
        await fetchSchedules()
      }
    } catch (error) {
      showAlert({ type: 'error', message: 'An error occurred' })
      console.error(error)
    }
  }

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || 'Unknown'

  const formatFrequency = (schedule: RecurringSchedule) => {
    if (schedule.frequency === 'daily') return 'Daily'
    if (schedule.frequency === 'weekly') {
      const day = DAYS_OF_WEEK.find(d => d.value === schedule.day_of_week)
      return `Weekly on ${day?.label || 'Unknown'}`
    }
    if (schedule.frequency === 'monthly') {
      return `Monthly on day ${schedule.day_of_month}`
    }
    return schedule.frequency
  }

  const expenseCategories = categories.filter(c => c.type === 'expense')
  const incomeCategories = categories.filter(c => c.type === 'income')
  const cashAccounts = accounts.filter(a => a.type === 'cash')
  const { privacyMode } = usePrivacy()

  // Calculate end-of-month projections
  const calculateEndOfMonthProjections = () => {
    const today = new Date()
    const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0) // Last day of current month
    
    let projectedNetWorthChange = 0
    let projectedCashChange = 0

    // Only calculate for active schedules
    schedules.filter(s => s.is_active).forEach(schedule => {
      let currentDate = new Date(today)
      let occurrences = 0

      // Count occurrences until end of month
      while (currentDate <= endOfMonthDate) {
        const shouldProcess = (() => {
          if (schedule.frequency === 'daily') return true
          if (schedule.frequency === 'weekly') return currentDate.getDay() === schedule.day_of_week
          if (schedule.frequency === 'monthly') {
            const dayOfMonth = currentDate.getDate()
            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
            const targetDay = schedule.day_of_month!
            if (targetDay > lastDayOfMonth) return dayOfMonth === lastDayOfMonth
            return dayOfMonth === targetDay
          }
          return false
        })()

        // Check if we should process this date
        if (shouldProcess && (!schedule.last_processed_date || currentDate.toISOString().split('T')[0] > schedule.last_processed_date)) {
          // Check if end_date constraint applies
          if (schedule.end_date && currentDate.toISOString().split('T')[0] > schedule.end_date) {
            break
          }
          
          // Check remaining_occurrences constraint
          if (schedule.remaining_occurrences !== undefined && occurrences >= schedule.remaining_occurrences) {
            break
          }
          
          occurrences++
        }

        currentDate.setDate(currentDate.getDate() + 1)
      }

      // Calculate impact for this schedule
      if (occurrences > 0) {
        if (schedule.type === 'transaction') {
          const account = accounts.find(a => a.id === schedule.account_id)
          if (account && account.type === 'cash' && !(account.exclude_from_cash_balance && account.exclude_from_net_worth)) {
            const totalAmount = schedule.amount * occurrences
            projectedCashChange += totalAmount
            
            // Also affects net worth if not excluded
            if (!account.exclude_from_net_worth) {
              projectedNetWorthChange += totalAmount
            }
          }
        } else if (schedule.type === 'transfer') {
          // Transfers don't change net worth, but may affect cash balance
          const fromAccount = accounts.find(a => a.id === schedule.account_id)
          const toAccount = accounts.find(a => a.id === schedule.to_account_id)
          
          if (fromAccount && fromAccount.type === 'cash' && !(fromAccount.exclude_from_cash_balance && fromAccount.exclude_from_net_worth)) {
            projectedCashChange -= schedule.amount * occurrences
          }
          
          if (toAccount && toAccount.type === 'cash' && !(toAccount.exclude_from_cash_balance && toAccount.exclude_from_net_worth)) {
            const amountTo = schedule.amount_to || schedule.amount
            projectedCashChange += amountTo * occurrences
          }
        }
      }
    })

    // Calculate current totals
    const currentCash = cashAccounts
      .filter(a => !(a.exclude_from_cash_balance && a.exclude_from_net_worth))
      .reduce((sum, acc) => sum + acc.balance, 0)
    
    const currentNetWorth = accounts.reduce((sum, acc) => {
      if (acc.exclude_from_net_worth) return sum
      return sum + acc.balance
    }, 0)

    return {
      projectedCash: currentCash + projectedCashChange,
      projectedNetWorth: currentNetWorth + projectedNetWorthChange,
      cashChange: projectedCashChange,
      netWorthChange: projectedNetWorthChange
    }
  }

  const endOfMonthProjections = calculateEndOfMonthProjections()

  // Calculate upcoming recurring amounts for next 30 days
  const calculateUpcomingImpact = () => {
    const today = new Date()
    const next30Days = new Date(today)
    next30Days.setDate(today.getDate() + 30)

    const accountImpact: Record<string, { debits: number; credits: number; currency: string }> = {}
    let totalExpenses = 0
    let totalIncome = 0
    let nextTransactions: Array<{ date: Date; description: string; amount: number; account: string }> = []

    // Initialize account impact
    cashAccounts.forEach(account => {
      accountImpact[account.id] = { debits: 0, credits: 0, currency: account.currency }
    })

    // Calculate occurrences for each schedule in the next 30 days
    schedules.filter(s => s.is_active).forEach(schedule => {
      const dates: Date[] = []
      let currentDate = new Date(today)

      while (currentDate <= next30Days) {
        const shouldProcess = (() => {
          if (schedule.frequency === 'daily') return true
          if (schedule.frequency === 'weekly') return currentDate.getDay() === schedule.day_of_week
          if (schedule.frequency === 'monthly') {
            const dayOfMonth = currentDate.getDate()
            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
            const targetDay = schedule.day_of_month!
            if (targetDay > lastDayOfMonth) return dayOfMonth === lastDayOfMonth
            return dayOfMonth === targetDay
          }
          return false
        })()

        if (shouldProcess && (!schedule.last_processed_date || currentDate.toISOString().split('T')[0] > schedule.last_processed_date)) {
          dates.push(new Date(currentDate))
        }

        currentDate.setDate(currentDate.getDate() + 1)
      }

      // Add impact for each occurrence
      dates.forEach(date => {
        if (schedule.type === 'transaction') {
          const account = accounts.find(a => a.id === schedule.account_id)
          if (!account) return

          if (schedule.amount < 0) {
            accountImpact[schedule.account_id].debits += Math.abs(schedule.amount)
            totalExpenses += Math.abs(schedule.amount)
          } else {
            accountImpact[schedule.account_id].credits += schedule.amount
            totalIncome += schedule.amount
          }

          nextTransactions.push({
            date,
            description: schedule.description || 'Recurring transaction',
            amount: schedule.amount,
            account: account.name
          })
        } else if (schedule.type === 'transfer' && schedule.to_account_id) {
          accountImpact[schedule.account_id].debits += Math.abs(schedule.amount)
          accountImpact[schedule.to_account_id].credits += Math.abs(schedule.amount_to || schedule.amount)

          const fromAccount = accounts.find(a => a.id === schedule.account_id)
          nextTransactions.push({
            date,
            description: `${schedule.description || 'Transfer'} (${fromAccount?.name})`,
            amount: -Math.abs(schedule.amount),
            account: fromAccount?.name || ''
          })
        }
      })
    })

    // Sort next transactions by date
    nextTransactions.sort((a, b) => a.date.getTime() - b.date.getTime())

    return { accountImpact, totalExpenses, totalIncome, nextTransactions }
  }

  const { accountImpact, totalExpenses, totalIncome, nextTransactions } = calculateUpcomingImpact()

  // Check which accounts will be insufficient
  const insufficientAccounts = cashAccounts.filter(account => {
    const impact = accountImpact[account.id]
    if (!impact) return false
    const projectedBalance = account.balance - impact.debits + impact.credits
    return projectedBalance < 0
  })

  // Calculate calendar data for recurring transactions
  const getCalendarData = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    
    // Get first day of the month and last day of the month
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // Get starting day of week (0 = Sunday)
    const startingDayOfWeek = firstDay.getDay()
    
    // Create calendar grid
    const daysInMonth = lastDay.getDate()
    const days: Array<{
      date: Date | null
      dayNumber: number | null
      transactions: Array<{ schedule: RecurringSchedule; amount: number; description: string }>
    }> = []
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ date: null, dayNumber: null, transactions: [] })
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const transactions: Array<{ schedule: RecurringSchedule; amount: number; description: string }> = []
      
      // Check each active schedule to see if it occurs on this date
      schedules.filter(s => s.is_active).forEach(schedule => {
        const shouldOccur = (() => {
          if (schedule.frequency === 'daily') {
            return true
          }
          if (schedule.frequency === 'weekly') {
            return date.getDay() === schedule.day_of_week
          }
          if (schedule.frequency === 'monthly') {
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
            const targetDay = schedule.day_of_month!
            if (targetDay > lastDayOfMonth) {
              return day === lastDayOfMonth
            }
            return day === targetDay
          }
          return false
        })()
        
        if (shouldOccur) {
          // Check if this date is after last_processed_date
          const dateStr = date.toISOString().split('T')[0]
          if (!schedule.last_processed_date || dateStr > schedule.last_processed_date) {
            // Check end_date constraint
            if (schedule.end_date && dateStr > schedule.end_date) {
              return
            }
            
            transactions.push({
              schedule,
              amount: schedule.amount,
              description: schedule.description || (schedule.type === 'transfer' ? 'Transfer' : 'Transaction')
            })
          }
        }
      })
      
      days.push({ date, dayNumber: day, transactions })
    }
    
    return { days, monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
  }

  const calendarData = getCalendarData()

  const goToPreviousMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCalendarDate(new Date())
  }

  return (
    <div className="space-y-6">
      {/* Top Row - Projected Cash and Account Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 border-emerald-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Projected Cash (End of Month)</span>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">
              <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                {privacyMode === 'hidden' 
                  ? '••••••' 
                  : endOfMonthProjections.projectedCash.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
              </span>
            </div>
            {endOfMonthProjections.cashChange !== 0 && (
              <span className={`text-sm font-medium ${endOfMonthProjections.cashChange > 0 ? 'text-success' : 'text-destructive'}`}>
                {endOfMonthProjections.cashChange > 0 ? '+' : ''}{endOfMonthProjections.cashChange.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Based on recurring schedules</p>
        </Card>

        <Card className={`p-4 ${insufficientAccounts.length > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-success/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Account Status</span>
            {insufficientAccounts.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Calendar className="h-4 w-4 text-success" />
            )}
          </div>
          <div className={`text-2xl font-bold ${insufficientAccounts.length > 0 ? 'text-destructive' : 'text-success'}`}>
            {insufficientAccounts.length > 0 ? `${insufficientAccounts.length} Warning${insufficientAccounts.length > 1 ? 's' : ''}` : 'All Good'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {insufficientAccounts.length > 0 ? 'Insufficient balance projected' : 'All accounts have sufficient funds'}
          </p>
        </Card>
      </div>

      {/* Bottom Row - Expenses and Income */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 border-destructive/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Next 30 Days Expenses</span>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </div>
          <div className="text-2xl font-bold text-destructive">
            <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
              {privacyMode === 'hidden' ? '••••••' : totalExpenses.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">From recurring schedules</p>
        </Card>

        <Card className="p-4 border-success/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Next 30 Days Income</span>
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div className="text-2xl font-bold text-success">
            <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
              {privacyMode === 'hidden' ? '••••••' : totalIncome.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">From recurring schedules</p>
        </Card>
      </div>

      {/* Account Breakdown */}
      {Object.keys(accountImpact).some(id => accountImpact[id].debits > 0 || accountImpact[id].credits > 0) && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Account Impact (Next 30 Days)
          </h3>
          <div className="space-y-2">
            {cashAccounts.filter(account => accountImpact[account.id]?.debits > 0 || accountImpact[account.id]?.credits > 0).map(account => {
              const impact = accountImpact[account.id]
              const projectedBalance = account.balance - impact.debits + impact.credits
              const isInsufficient = projectedBalance < 0

              return (
                <div key={account.id} className={`flex items-center justify-between p-2 rounded ${isInsufficient ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {account.name}
                      {isInsufficient && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Current: <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        {privacyMode === 'hidden' ? '••••' : account.balance.toFixed(2)}
                      </span> {account.currency}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs space-x-2">
                      {impact.debits > 0 && (
                        <span className="text-destructive">
                          -{impact.debits.toFixed(0)}
                        </span>
                      )}
                      {impact.credits > 0 && (
                        <span className="text-success">
                          +{impact.credits.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className={`text-sm font-medium ${isInsufficient ? 'text-destructive' : ''}`}>
                      → <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        {privacyMode === 'hidden' ? '••••' : projectedBalance.toFixed(0)}
                      </span> {account.currency}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Next Upcoming Transactions */}
      {nextTransactions.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Next 30 Days Transactions
          </h3>
          <div className="space-y-2">
            {nextTransactions.map((tx, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm py-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16">
                    {tx.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span>{tx.description}</span>
                  <span className="text-xs text-muted-foreground">({tx.account})</span>
                </div>
                <span className={`font-medium ${tx.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                  <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                    {privacyMode === 'hidden' ? '••••' : `${tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(0)}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add/Edit Form Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Manage Schedules
          </h2>
        </div>
        <Button onClick={() => {
          if (isAdding) {
            resetForm()
          } else {
            setIsAdding(true)
            // Set default subscription category when opening form
            const subscriptionCategory = expenseCategories.find(
              cat => cat.name.toLowerCase() === 'subscription'
            )
            if (subscriptionCategory && !editingId) {
              setFormData(prev => ({ ...prev, category_id: subscriptionCategory.id }))
            }
          }
        }} variant={isAdding ? 'outline' : 'default'}>
          {!isAdding && <Plus className="mr-2 h-4 w-4" />}
          {isAdding ? 'Cancel' : 'Add Recurring'}
        </Button>
      </div>

      {isAdding && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Recurring Schedule' : 'New Recurring Schedule'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as 'transaction' | 'transfer' })}
                  required
                >
                  <option value="transaction">Transaction (Income/Expense)</option>
                  <option value="transfer">Transfer Between Accounts</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  id="frequency"
                  value={formData.frequency}
                  onChange={e => setFormData({ ...formData, frequency: e.target.value as any })}
                  required
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
            </div>

            {formData.frequency === 'weekly' && (
              <div className="space-y-2">
                <Label htmlFor="day_of_week">Day of Week</Label>
                <Select
                  id="day_of_week"
                  value={formData.day_of_week.toString()}
                  onChange={e => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                  required
                >
                  {DAYS_OF_WEEK.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </Select>
              </div>
            )}

            {formData.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="day_of_month">Day of Month</Label>
                <Input
                  id="day_of_month"
                  type="number"
                  min="1"
                  max="31"
                  value={formData.day_of_month}
                  onChange={e => setFormData({ ...formData, day_of_month: e.target.value })}
                  placeholder="Enter day (1-31)"
                  required
                />
              </div>
            )}

            {formData.type === 'transaction' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transaction_type">Transaction Type</Label>
                    <Select
                      id="transaction_type"
                      value={formData.transaction_type}
                      onChange={e => {
                        const newType = e.target.value as 'expense' | 'income'
                        let defaultCategoryId = ''
                        
                        // Set default category to "Subscription" for expenses if it exists
                        if (newType === 'expense') {
                          const subscriptionCategory = expenseCategories.find(
                            cat => cat.name.toLowerCase() === 'subscription'
                          )
                          if (subscriptionCategory) {
                            defaultCategoryId = subscriptionCategory.id
                          }
                        }
                        
                        setFormData({ ...formData, transaction_type: newType, category_id: defaultCategoryId })
                      }}
                      required
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account">Account</Label>
                    <Select
                      id="account"
                      value={formData.account_id}
                      onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                      required
                    >
                      <option value="">Select account</option>
                      {cashAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      id="category"
                      value={formData.category_id}
                      onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                      required
                    >
                      <option value="">Select category</option>
                      {(formData.transaction_type === 'expense' ? expenseCategories : incomeCategories).map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      value={formData.amount}
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.')
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })()
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({ ...formData, amount: formatted })
                      }}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {formData.type === 'transfer' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="from_account">From Account</Label>
                    <Select
                      id="from_account"
                      value={formData.account_id}
                      onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                      required
                    >
                      <option value="">Select account</option>
                      {cashAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="to_account">To Account</Label>
                    <Select
                      id="to_account"
                      value={formData.to_account_id}
                      onChange={e => setFormData({ ...formData, to_account_id: e.target.value })}
                      required
                    >
                      <option value="">Select account</option>
                      {cashAccounts.filter(a => a.id !== formData.account_id).map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount_from">Amount to Send</Label>
                    <Input
                      id="amount_from"
                      type="text"
                      inputMode="decimal"
                      value={formData.amount}
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.')
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })()
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({ ...formData, amount: formatted })
                      }}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount_to">Amount to Receive (optional)</Label>
                    <Input
                      id="amount_to"
                      type="text"
                      inputMode="decimal"
                      value={formData.amount_to}
                      onChange={e => {
                        let value = e.target.value.replace(/\s/g, '')
                        if (!/^\d*\.?\d*$/.test(value)) return
                        const formatted = value.includes('.')
                          ? (() => { const [integer, decimal] = value.split('.'); return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + decimal })()
                          : value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                        setFormData({ ...formData, amount_to: formatted })
                      }}
                      placeholder="Leave empty if same currency"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="limit_type">Duration</Label>
              <Select
                id="limit_type"
                value={formData.limit_type}
                onChange={e => setFormData({ 
                  ...formData, 
                  limit_type: e.target.value as 'unlimited' | 'occurrences' | 'end_date',
                  remaining_occurrences: '',
                  end_date: ''
                })}
              >
                <option value="unlimited">Unlimited (runs forever)</option>
                <option value="occurrences">Limited number of times</option>
                <option value="end_date">Until specific date</option>
              </Select>
            </div>

            {formData.limit_type === 'occurrences' && (
              <div className="space-y-2">
                <Label htmlFor="remaining_occurrences">Number of Occurrences</Label>
                <Input
                  id="remaining_occurrences"
                  type="number"
                  min="1"
                  value={formData.remaining_occurrences}
                  onChange={e => setFormData({ ...formData, remaining_occurrences: e.target.value })}
                  placeholder="e.g., 12 for yearly subscription"
                  required
                />
              </div>
            )}

            {formData.limit_type === 'end_date' && (
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Monthly rent, Weekly groceries"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingId ? 'Update Schedule' : 'Create Schedule'}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : schedules.length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Recurring Schedules</h3>
          <p className="text-muted-foreground">
            Create your first recurring transaction to automate your finances
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => {
            const account = accounts.find(a => a.id === schedule.account_id)
            const toAccount = schedule.to_account_id ? accounts.find(a => a.id === schedule.to_account_id) : undefined
            const category = schedule.category_id ? categories.find(c => c.id === schedule.category_id) : undefined

            return (
              <Card key={schedule.id} className={`p-4 ${!schedule.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {category?.icon && <span className="text-2xl">{category.icon}</span>}
                      <div>
                        <h4 className="font-semibold">
                          {schedule.type === 'transaction' 
                            ? `${category?.name || 'Transaction'} - ${getAccountName(schedule.account_id)}`
                            : `Transfer: ${getAccountName(schedule.account_id)} → ${toAccount?.name || 'Unknown'}`
                          }
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {formatFrequency(schedule)}
                          {schedule.last_processed_date && (
                            <span className="ml-2">• Last: {schedule.last_processed_date}</span>
                          )}
                          {schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null && (
                            <span className="ml-2">• {schedule.remaining_occurrences} left</span>
                          )}
                          {schedule.end_date && (
                            <span className="ml-2">• Until {schedule.end_date}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {schedule.description && (
                      <p className="text-sm text-muted-foreground ml-11">{schedule.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`font-semibold ${schedule.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                        {schedule.amount < 0 ? '-' : '+'}{Math.abs(schedule.amount).toFixed(2)} {account?.currency}
                      </div>
                      {schedule.amount_to && toAccount && (
                        <div className="text-xs text-muted-foreground">
                          → {schedule.amount_to.toFixed(2)} {toAccount.currency}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={schedule.is_active ? 'outline' : 'default'}
                        onClick={() => toggleActive(schedule)}
                      >
                        {schedule.is_active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(schedule)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Calendar View */}
      <Card className="p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Recurring Transactions Calendar
            </h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={goToToday}>
                Today
              </Button>
              <Button size="sm" variant="outline" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[150px] text-center">
                {calendarData.monthName}
              </span>
              <Button size="sm" variant="outline" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendarData.days.map((day, idx) => {
              const isToday = day.date && 
                day.date.toDateString() === new Date().toDateString()
              const isPast = day.date && day.date < new Date(new Date().setHours(0, 0, 0, 0))
              
              return (
                <div
                  key={idx}
                  className={`min-h-[80px] border rounded p-1 ${
                    !day.date ? 'bg-muted/30' : 
                    isToday ? 'border-primary border-2 bg-primary/5' :
                    isPast ? 'bg-muted/50' : 'bg-background'
                  }`}
                >
                  {day.dayNumber && (
                    <>
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                        {day.dayNumber}
                      </div>
                      <div className="space-y-0.5">
                        {day.transactions.map((tx, txIdx) => {
                          const category = tx.schedule.category_id 
                            ? categories.find(c => c.id === tx.schedule.category_id)
                            : null
                          const account = accounts.find(a => a.id === tx.schedule.account_id)
                          
                          return (
                            <div
                              key={txIdx}
                              className={`text-[10px] px-1 py-0.5 rounded truncate ${
                                tx.amount < 0 
                                  ? 'bg-destructive/10 text-destructive' 
                                  : 'bg-success/10 text-success'
                              }`}
                              title={`${tx.description} - ${account?.name || ''} - ${
                                privacyMode === 'hidden' ? '••••' : 
                                Math.abs(tx.amount).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                              }`}
                            >
                              <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                                {category?.icon || ''} {privacyMode === 'hidden' ? '••' : Math.abs(tx.amount).toFixed(0)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}
