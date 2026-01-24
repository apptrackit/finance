import { useState, useEffect } from 'react'
import { API_BASE_URL, apiFetch } from '../../config'
import { Button } from '../common/button'
import { Card } from '../common/card'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { Plus, Trash2, Edit2, Clock, TrendingDown, TrendingUp, AlertTriangle, Calendar, Wallet, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAlert } from '../../context/AlertContext'
import { usePrivacy } from '../../context/PrivacyContext'

// Helper function to convert Date to local YYYY-MM-DD string (no timezone conversion)
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_week?: number
  day_of_month?: number
  month?: number
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
  const { confirm, showAlert } = useAlert()
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarMode, setCalendarMode] = useState<'30-day' | 'monthly'>('30-day')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAllTransactions, setShowAllTransactions] = useState(false)

  const [formData, setFormData] = useState({
    type: 'transaction' as 'transaction' | 'transfer',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    day_of_week: 1,
    day_of_month: '1',
    month: new Date().getMonth(),
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
      month: new Date().getMonth(),
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
    if (isSubmitting) return

    const amount = parseFloat(formData.amount.replace(/\s/g, ''))
    if (isNaN(amount) || amount <= 0) {
      showAlert({ type: 'error', message: 'Please enter a valid amount' })
      return
    }

    setIsSubmitting(true)

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
    } else if (formData.frequency === 'monthly' || formData.frequency === 'yearly') {
      const dayOfMonth = parseInt(formData.day_of_month)
      if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
        payload.day_of_month = dayOfMonth
      } else {
        showAlert({ type: 'error', message: 'Please enter a valid day of month (1-31)' })
        return
      }
      
      if (formData.frequency === 'yearly') {
        payload.month = formData.month
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
    if (formData.limit_type === 'occurrences') {
      if (formData.remaining_occurrences) {
        const occurrences = parseInt(formData.remaining_occurrences)
        if (!isNaN(occurrences) && occurrences > 0) {
          payload.remaining_occurrences = occurrences
        }
      }
      // Clear end_date when using occurrences
      payload.end_date = null
    } else if (formData.limit_type === 'end_date') {
      if (formData.end_date) {
        payload.end_date = formData.end_date
      }
      // Clear remaining_occurrences when using end_date
      payload.remaining_occurrences = null
    } else {
      // For unlimited, explicitly clear both fields
      payload.remaining_occurrences = null
      payload.end_date = null
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
    if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null) {
      limit_type = 'occurrences'
    } else if (schedule.end_date && schedule.end_date !== null) {
      limit_type = 'end_date'
    }

    setFormData({
      type: schedule.type,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week ?? 1,
      day_of_month: schedule.day_of_month?.toString() ?? '1',
      month: schedule.month ?? new Date().getMonth(),
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
    const confirmed = await confirm({
      title: 'Delete Recurring Schedule',
      message: 'Are you sure you want to delete this recurring schedule? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })
    
    if (!confirmed) return

    setDeletingId(id)
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
    } finally {
      setDeletingId(null)
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
    if (schedule.frequency === 'yearly') {
      const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
      const monthName = new Date(2000, targetMonth, 1).toLocaleDateString('en-US', { month: 'long' })
      return `Yearly on ${monthName} ${schedule.day_of_month}`
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
          if (schedule.frequency === 'yearly') {
            const month = currentDate.getMonth()
            const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
            
            if (month !== targetMonth) return false
            
            const dayOfMonth = currentDate.getDate()
            const lastDayOfTargetMonth = new Date(currentDate.getFullYear(), month + 1, 0).getDate()
            const targetDay = schedule.day_of_month!
            if (targetDay > lastDayOfTargetMonth) return dayOfMonth === lastDayOfTargetMonth
            return dayOfMonth === targetDay
          }
          return false
        })()

        // Check if we should process this date
        if (shouldProcess && (!schedule.last_processed_date || toLocalDateString(currentDate) > schedule.last_processed_date)) {
          // Check if end_date constraint applies
          if (schedule.end_date && toLocalDateString(currentDate) > schedule.end_date) {
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

    console.log('[RecurringTransactions] Calculating upcoming impact, today:', toLocalDateString(today))
    console.log('[RecurringTransactions] Active schedules:', schedules.filter(s => s.is_active))

    // Calculate occurrences for each schedule in the next 30 days
    schedules.filter(s => s.is_active).forEach(schedule => {
      console.log(`[RecurringTransactions] Processing schedule ${schedule.id}:`, {
        frequency: schedule.frequency,
        last_processed_date: schedule.last_processed_date,
        remaining_occurrences: schedule.remaining_occurrences,
        end_date: schedule.end_date
      })
      
      const dates: Date[] = []
      let currentDate = new Date(today)
      let occurrenceCount = 0

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
          if (schedule.frequency === 'yearly') {
            const month = currentDate.getMonth()
            const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
            
            if (month !== targetMonth) return false
            
            const dayOfMonth = currentDate.getDate()
            const lastDayOfTargetMonth = new Date(currentDate.getFullYear(), month + 1, 0).getDate()
            const targetDay = schedule.day_of_month!
            if (targetDay > lastDayOfTargetMonth) return dayOfMonth === lastDayOfTargetMonth
            return dayOfMonth === targetDay
          }
          return false
        })()

        const dateStr = toLocalDateString(currentDate)
        
        if (shouldProcess && (!schedule.last_processed_date || dateStr > schedule.last_processed_date)) {
          // Check end_date constraint
          if (schedule.end_date && dateStr > schedule.end_date) {
            console.log(`[RecurringTransactions] Breaking due to end_date: ${dateStr} > ${schedule.end_date}`)
            break
          }
          
          // Check remaining_occurrences constraint
          if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null) {
            occurrenceCount++
            if (occurrenceCount > schedule.remaining_occurrences) {
              console.log(`[RecurringTransactions] Breaking due to remaining_occurrences: ${occurrenceCount} > ${schedule.remaining_occurrences}`)
              break
            }
          }
          
          dates.push(new Date(currentDate))
        }

        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      console.log(`[RecurringTransactions] Found ${dates.length} upcoming dates for schedule ${schedule.id}`)
      if (dates.length > 0) {
        console.log(`[RecurringTransactions] First 5 dates:`, dates.slice(0, 5).map(d => toLocalDateString(d)))
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

  // Helper function to count occurrences between two dates
  const countOccurrencesBetween = (schedule: RecurringSchedule, startDate: Date, endDate: Date): number => {
    let count = 0
    const current = new Date(startDate)
    current.setHours(0, 0, 0, 0)
    
    while (current <= endDate) {
      const shouldOccur = (() => {
        if (schedule.frequency === 'daily') {
          return true
        }
        if (schedule.frequency === 'weekly') {
          return current.getDay() === schedule.day_of_week
        }
        if (schedule.frequency === 'monthly') {
          const lastDayOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
          const targetDay = schedule.day_of_month!
          if (targetDay > lastDayOfMonth) {
            return current.getDate() === lastDayOfMonth
          }
          return current.getDate() === targetDay
        }
        if (schedule.frequency === 'yearly') {
          const month = current.getMonth()
          const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
          
          if (month !== targetMonth) return false
          
          const lastDayOfTargetMonth = new Date(current.getFullYear(), month + 1, 0).getDate()
          const targetDay = schedule.day_of_month!
          if (targetDay > lastDayOfTargetMonth) {
            return current.getDate() === lastDayOfTargetMonth
          }
          return current.getDate() === targetDay
        }
        return false
      })()
      
      if (shouldOccur) {
        count++
      }
      
      current.setDate(current.getDate() + 1)
    }
    
    return count
  }

  // Calculate calendar data for recurring transactions
  const getCalendarData = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (calendarMode === '30-day') {
      // 30-day rolling view
      const startDate = new Date(calendarDate)
      startDate.setHours(0, 0, 0, 0)
      
      // Calculate 30 days from start date
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 30)
      
      const days: Array<{
        date: Date | null
        dayNumber: number | null
        monthLabel?: string
        transactions: Array<{ schedule: RecurringSchedule; amount: number; description: string }>
      }> = []
      
      // Add empty cells to align first day with correct day of week (Monday = 0)
      const firstDayOfWeek = (startDate.getDay() + 6) % 7
      for (let i = 0; i < firstDayOfWeek; i++) {
        days.push({ date: null, dayNumber: null, transactions: [] })
      }
      
      // Add all days in the 30-day range
      let currentDate = new Date(startDate)
      let lastMonth = -1
      
      while (currentDate <= endDate) {
        const date = new Date(currentDate)
        const transactions: Array<{ schedule: RecurringSchedule; amount: number; description: string }> = []
        
        // Add month label for first day of each new month
        let monthLabel: string | undefined
        if (date.getMonth() !== lastMonth) {
          monthLabel = date.toLocaleDateString('en-US', { month: 'short' })
          lastMonth = date.getMonth()
        }
        
        // Only process dates that are today or in the future
        if (date >= today) {
          // Check each active schedule to see if it occurs on this date
          schedules.filter(s => s.is_active).forEach(schedule => {
            // Check if the schedule was created before or on this date
            const scheduleCreatedDate = new Date(schedule.created_at)
            scheduleCreatedDate.setHours(0, 0, 0, 0)
            
            if (date < scheduleCreatedDate) {
              // Don't show transactions before the schedule was created
              return
            }
            
            const shouldOccur = (() => {
              if (schedule.frequency === 'daily') {
                return true
              }
              if (schedule.frequency === 'weekly') {
                return date.getDay() === schedule.day_of_week
              }
              if (schedule.frequency === 'monthly') {
                const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
                const targetDay = schedule.day_of_month!
                if (targetDay > lastDayOfMonth) {
                  return date.getDate() === lastDayOfMonth
                }
                return date.getDate() === targetDay
              }
              if (schedule.frequency === 'yearly') {
                const month = date.getMonth()
                const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
                
                if (month !== targetMonth) return false
                
                const lastDayOfTargetMonth = new Date(date.getFullYear(), month + 1, 0).getDate()
                const targetDay = schedule.day_of_month!
                if (targetDay > lastDayOfTargetMonth) {
                  return date.getDate() === lastDayOfTargetMonth
                }
                return date.getDate() === targetDay
              }
              return false
            })()
            
            if (shouldOccur) {
              // Check if this date is after last_processed_date
              const dateStr = toLocalDateString(date)
              if (!schedule.last_processed_date || dateStr > schedule.last_processed_date) {
                // Check end_date constraint
                if (schedule.end_date && dateStr > schedule.end_date) {
                  return
                }
                
                // Check remaining_occurrences constraint
                if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null) {
                  // Count occurrences from last processed date (or creation date if never processed) to this date
                  const startCountingFrom = schedule.last_processed_date 
                    ? new Date(schedule.last_processed_date)
                    : scheduleCreatedDate
                  
                  // Start counting from the day AFTER last processed
                  startCountingFrom.setDate(startCountingFrom.getDate() + 1)
                  
                  const occurrencesFromLastProcessed = countOccurrencesBetween(schedule, startCountingFrom, date)
                  
                  // If this occurrence number exceeds remaining count, don't show it
                  if (occurrencesFromLastProcessed > schedule.remaining_occurrences) {
                    return
                  }
                }
                
                transactions.push({
                  schedule,
                  amount: schedule.amount,
                  description: schedule.description || (schedule.type === 'transfer' ? 'Transfer' : 'Transaction')
                })
              }
            }
          })
        }
        
        days.push({ date, dayNumber: date.getDate(), monthLabel, transactions })
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      const monthName = `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      return { days, monthName }
    } else {
      // Monthly view
      const year = calendarDate.getFullYear()
      const month = calendarDate.getMonth()
      
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      
      // Get starting day of week (0 = Sunday, convert to Monday = 0)
      const startingDayOfWeek = (firstDay.getDay() + 6) % 7
      
      // Create calendar grid
      const daysInMonth = lastDay.getDate()
      const days: Array<{
        date: Date | null
        dayNumber: number | null
        monthLabel?: string
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
        
        // Only process dates that are today or in the future
        if (date >= today) {
          // Check each active schedule to see if it occurs on this date
          schedules.filter(s => s.is_active).forEach(schedule => {
            // Check if the schedule was created before or on this date
            const scheduleCreatedDate = new Date(schedule.created_at)
            scheduleCreatedDate.setHours(0, 0, 0, 0)
            
            if (date < scheduleCreatedDate) {
              // Don't show transactions before the schedule was created
              return
            }
            
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
              if (schedule.frequency === 'yearly') {
                const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
                
                if (month !== targetMonth) return false
                
                const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate()
                const targetDay = schedule.day_of_month!
                if (targetDay > lastDayOfTargetMonth) {
                  return day === lastDayOfTargetMonth
                }
                return day === targetDay
              }
              return false
            })()
            
            if (shouldOccur) {
              // Check if this date is after last_processed_date
              const dateStr = toLocalDateString(date)
              if (!schedule.last_processed_date || dateStr > schedule.last_processed_date) {
                // Check end_date constraint
                if (schedule.end_date && dateStr > schedule.end_date) {
                  return
                }
                
                // Check remaining_occurrences constraint
                if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null) {
                  // Count occurrences from last processed date (or creation date if never processed) to this date
                  const startCountingFrom = schedule.last_processed_date 
                    ? new Date(schedule.last_processed_date)
                    : scheduleCreatedDate
                  
                  // Start counting from the day AFTER last processed
                  startCountingFrom.setDate(startCountingFrom.getDate() + 1)
                  
                  const occurrencesFromLastProcessed = countOccurrencesBetween(schedule, startCountingFrom, date)
                  
                  // If this occurrence number exceeds remaining count, don't show it
                  if (occurrencesFromLastProcessed > schedule.remaining_occurrences) {
                    return
                  }
                }
                
                transactions.push({
                  schedule,
                  amount: schedule.amount,
                  description: schedule.description || (schedule.type === 'transfer' ? 'Transfer' : 'Transaction')
                })
              }
            }
          })
        }
        
        days.push({ date, dayNumber: day, transactions })
      }
      
      return { days, monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
    }
  }

  const calendarData = getCalendarData()

  const goToPreviousMonth = () => {
    setCalendarMode('monthly')
    const newDate = new Date(calendarDate)
    newDate.setMonth(newDate.getMonth() - 1, 1)
    setCalendarDate(newDate)
  }

  const goToNextMonth = () => {
    setCalendarMode('monthly')
    const newDate = new Date(calendarDate)
    newDate.setMonth(newDate.getMonth() + 1, 1)
    setCalendarDate(newDate)
  }

  const goToToday = () => {
    setCalendarMode('30-day')
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
              {privacyMode === 'hidden' ? '••••••' : (totalExpenses > 0 ? '-' : '') + totalExpenses.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
              {privacyMode === 'hidden' ? '••••••' : (totalIncome > 0 ? '+' : '') + totalIncome.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                        {privacyMode === 'hidden' ? '••••' : account.balance.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span> {account.currency}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs space-x-2">
                      {impact.debits > 0 && (
                        <span className={`text-destructive ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '-••••' : `-${impact.debits.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                        </span>
                      )}
                      {impact.credits > 0 && (
                        <span className={`text-success ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '+••••' : `+${impact.credits.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                        </span>
                      )}
                    </div>
                    <div className={`text-sm font-medium ${isInsufficient ? 'text-destructive' : ''}`}>
                      → <span className={privacyMode === 'hidden' ? 'select-none' : ''}>
                        {privacyMode === 'hidden' ? '••••' : projectedBalance.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
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
            {(showAllTransactions ? nextTransactions : nextTransactions.slice(0, 5)).map((tx, idx) => (
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
                    {privacyMode === 'hidden' ? '••••' : `${tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {nextTransactions.length > 5 && (
            <div className="mt-3 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllTransactions(!showAllTransactions)}
                className="w-full"
              >
                {showAllTransactions ? 'Show Less' : `Show All (${nextTransactions.length})`}
              </Button>
            </div>
          )}
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
                  <option value="yearly">Yearly</option>
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
                  onChange={e => {
                    const value = e.target.value
                    // Allow empty or valid numbers 1-31
                    if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 31)) {
                      setFormData({ ...formData, day_of_month: value })
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                    }
                  }}
                  placeholder="Enter day (1-31)"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  If the day doesn't exist in a month (e.g., day 31 in February), it will process on the last day of that month
                </p>
              </div>
            )}

            {formData.frequency === 'yearly' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="month_yearly">Month</Label>
                  <Select
                    id="month_yearly"
                    value={formData.month.toString()}
                    onChange={e => setFormData({ ...formData, month: parseInt(e.target.value) })}
                    required
                  >
                    <option value="0">January</option>
                    <option value="1">February</option>
                    <option value="2">March</option>
                    <option value="3">April</option>
                    <option value="4">May</option>
                    <option value="5">June</option>
                    <option value="6">July</option>
                    <option value="7">August</option>
                    <option value="8">September</option>
                    <option value="9">October</option>
                    <option value="10">November</option>
                    <option value="11">December</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="day_of_month_yearly">Day of Month</Label>
                  <Input
                    id="day_of_month_yearly"
                    type="number"
                    min="1"
                    max="31"
                    value={formData.day_of_month}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 31)) {
                        setFormData({ ...formData, day_of_month: value })
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                      }
                    }}
                    placeholder="Enter day (1-31)"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The schedule will repeat on this day and month every year. If the day doesn't exist (e.g., Feb 31), it will process on the last day of that month.
                  </p>
                </div>
              </>
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
                      onKeyDown={e => {
                        if (e.key.length === 1 && !/[0-9.]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                          e.preventDefault()
                        }
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
                      onKeyDown={e => {
                        if (e.key.length === 1 && !/[0-9.]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                          e.preventDefault()
                        }
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
                      onKeyDown={e => {
                        if (e.key.length === 1 && !/[0-9.]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                          e.preventDefault()
                        }
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
                  onKeyDown={e => {
                    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                    }
                  }}
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
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Schedule' : 'Create Schedule')}
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
                      <div className={`font-semibold ${schedule.amount < 0 ? 'text-destructive' : 'text-success'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                        {privacyMode === 'hidden' 
                          ? `${schedule.amount < 0 ? '-' : '+'}••••` 
                          : `${schedule.amount < 0 ? '-' : '+'}${Math.abs(schedule.amount).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`
                        } {account?.currency}
                      </div>
                      {schedule.amount_to && toAccount && (
                        <div className={`text-xs text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          → {privacyMode === 'hidden' ? '••••' : schedule.amount_to.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} {toAccount.currency}
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
                        disabled={deletingId === schedule.id}
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
      <Card className="p-3 md:p-6">
        <div className="mb-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-3">
            <h3 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              Recurring Transactions Calendar
            </h3>
            <div className="flex items-center gap-1 md:gap-2 w-full md:w-auto">
              <Button size="sm" variant="outline" onClick={goToToday} className="text-xs md:text-sm px-2 md:px-3">
                Today
              </Button>
              <Button size="sm" variant="outline" onClick={goToPreviousMonth} className="px-2 md:px-3">
                <ChevronLeft className="h-3 w-3 md:h-4 md:w-4" />
              </Button>
              <span className="text-xs md:text-sm font-medium min-w-[120px] md:min-w-[150px] text-center">
                {calendarData.monthName}
              </span>
              <Button size="sm" variant="outline" onClick={goToNextMonth} className="px-2 md:px-3">
                <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
              </Button>
            </div>
          </div>
          
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-0.5 md:gap-1">
            {/* Day headers */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center text-[10px] md:text-xs font-semibold text-muted-foreground py-1 md:py-2">
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
                  className={`min-h-[60px] md:min-h-[80px] border rounded p-0.5 md:p-1 ${
                    !day.date ? 'bg-muted/30' : 
                    isToday ? 'border-primary border-2 bg-primary/5' :
                    isPast ? 'bg-muted/50 opacity-40' : 'bg-background'
                  }`}
                >
                  {day.dayNumber && (
                    <>
                      <div className="flex items-center justify-between mb-0.5 md:mb-1">
                        <div className={`text-[11px] md:text-xs font-medium ${
                          isPast ? 'text-muted-foreground/50' :
                          isToday ? 'text-primary font-bold' : 'text-muted-foreground'
                        }`}>
                          {day.dayNumber}
                        </div>
                        {day.monthLabel && (
                          <div className="text-[9px] md:text-[10px] font-semibold text-muted-foreground/70 uppercase">
                            {day.monthLabel}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {day.transactions.map((tx, txIdx) => {
                          const category = tx.schedule.category_id 
                            ? categories.find(c => c.id === tx.schedule.category_id)
                            : null
                          const account = accounts.find(a => a.id === tx.schedule.account_id)
                          
                          // On mobile, show icon only for first 2 transactions, then show count
                          const isMobile = window.innerWidth < 768
                          const showAsIcon = isMobile && txIdx < 2
                          const showCount = isMobile && txIdx === 2 && day.transactions.length > 2
                          
                          if (showCount) {
                            return (
                              <div
                                key={txIdx}
                                className="text-[9px] md:text-[10px] px-0.5 md:px-1 py-0.5 rounded text-center bg-muted text-muted-foreground font-semibold"
                                title={`${day.transactions.length - 2} more transactions`}
                              >
                                +{day.transactions.length - 2}
                              </div>
                            )
                          }
                          
                          if (isMobile && txIdx > 2) {
                            return null
                          }
                          
                          return (
                            <div
                              key={txIdx}
                              className={`text-[9px] md:text-[10px] px-0.5 md:px-1 py-0.5 rounded truncate flex items-center justify-center ${
                                tx.amount < 0 
                                  ? 'bg-destructive/10 text-destructive' 
                                  : 'bg-success/10 text-success'
                              }`}
                              title={`${tx.description} - ${account?.name || ''} - ${
                                privacyMode === 'hidden' ? '••••' : 
                                Math.abs(tx.amount).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                              }`}
                            >
                              <span className={`${privacyMode === 'hidden' ? 'select-none' : ''} truncate`}>
                                {showAsIcon ? (
                                  <span className="text-xs md:text-sm">{category?.icon || '📝'}</span>
                                ) : (
                                  <>
                                    <span className="hidden md:inline">{category?.icon || ''} </span>
                                    <span className="hidden md:inline">{privacyMode === 'hidden' ? '••' : Math.abs(tx.amount).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                                    <span className="md:hidden text-xs">{category?.icon || '📝'}</span>
                                  </>
                                )}
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
