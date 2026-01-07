import { useState, useEffect } from 'react'
import { API_BASE_URL, apiFetch } from '../config'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Plus, Trash2, Edit2, RefreshCw, Clock } from 'lucide-react'
import { useAlert } from '../context/AlertContext'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
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

  const [formData, setFormData] = useState({
    type: 'transaction' as 'transaction' | 'transfer',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly',
    day_of_week: 1,
    day_of_month: 1,
    account_id: '',
    to_account_id: '',
    category_id: '',
    amount: '',
    amount_to: '',
    description: '',
    transaction_type: 'expense' as 'expense' | 'income'
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
    setFormData({
      type: 'transaction',
      frequency: 'monthly',
      day_of_week: 1,
      day_of_month: 1,
      account_id: '',
      to_account_id: '',
      category_id: '',
      amount: '',
      amount_to: '',
      description: '',
      transaction_type: 'expense'
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
      payload.day_of_month = formData.day_of_month
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
    setFormData({
      type: schedule.type,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week ?? 1,
      day_of_month: schedule.day_of_month ?? 1,
      account_id: schedule.account_id,
      to_account_id: schedule.to_account_id || '',
      category_id: schedule.category_id || '',
      amount: Math.abs(schedule.amount).toString(),
      amount_to: schedule.amount_to?.toString() || '',
      description: schedule.description || '',
      transaction_type: schedule.amount < 0 ? 'expense' : 'income'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            Recurring Transactions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage automated recurring transactions and transfers
          </p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)}>
          <Plus className="mr-2 h-4 w-4" />
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
                  onChange={e => setFormData({ ...formData, day_of_month: parseInt(e.target.value) || 1 })}
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
                      onChange={e => setFormData({ ...formData, transaction_type: e.target.value as 'expense' | 'income', category_id: '' })}
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
    </div>
  )
}
