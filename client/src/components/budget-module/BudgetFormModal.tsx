import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../common/modal'
import { Input } from '../common/input'
import { Select } from '../common/select'
import { Button } from '../common/button'
import type { Budget, BudgetFormData, BudgetAccountScope, BudgetCategoryScope, BudgetPeriod } from './types'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
}

type Category = {
  id: string
  name: string
  type: 'income' | 'expense'
  icon?: string
}

type BudgetFormModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: {
    name?: string
    amount: number
    period: BudgetPeriod
    year: number
    month?: number
    account_scope: BudgetAccountScope
    category_scope: BudgetCategoryScope
    account_ids?: string[]
    category_ids?: string[]
  }) => Promise<void>
  accounts: Account[]
  categories: Category[]
  initialData?: Budget | null
  masterCurrency: string
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const emptyForm = (year: number): BudgetFormData => ({
  name: '',
  amount: '',
  period: 'monthly',
  year,
  month: new Date().getMonth() + 1,
  account_scope: 'cash',
  category_scope: 'all',
  account_ids: [],
  category_ids: []
})

export function BudgetFormModal({
  isOpen,
  onClose,
  onSave,
  accounts,
  categories,
  initialData,
  masterCurrency
}: BudgetFormModalProps) {
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState<BudgetFormData>(() => emptyForm(currentYear))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cashAccounts = useMemo(
    () => accounts.filter(account => account.type === 'cash'),
    [accounts]
  )
  const expenseCategories = useMemo(
    () => categories.filter(category => category.type === 'expense'),
    [categories]
  )

  useEffect(() => {
    if (!isOpen) return
    if (!initialData) {
      setForm(emptyForm(currentYear))
      setError(null)
      return
    }

    const [year, month] = initialData.start_date.split('-').map(Number)

    setForm({
      name: initialData.name ?? '',
      amount: String(initialData.amount),
      period: initialData.period,
      year: year || currentYear,
      month: month || 1,
      account_scope: initialData.account_scope,
      category_scope: initialData.category_scope,
      account_ids: initialData.account_ids ?? [],
      category_ids: initialData.category_ids ?? []
    })
    setError(null)
  }, [isOpen, initialData, currentYear])

  const yearOptions = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => currentYear - 3 + idx),
    [currentYear]
  )

  const handleSave = async () => {
    setError(null)
    const amountValue = Number(form.amount)
    if (!amountValue || amountValue <= 0) {
      setError('Enter a valid amount greater than 0.')
      return
    }
    if (form.account_scope === 'selected' && form.account_ids.length === 0) {
      setError('Select at least one account.')
      return
    }
    if (form.category_scope === 'selected' && form.category_ids.length === 0) {
      setError('Select at least one category.')
      return
    }

    setIsSubmitting(true)
    try {
      await onSave({
        name: form.name.trim() || undefined,
        amount: amountValue,
        period: form.period,
        year: form.year,
        month: form.period === 'monthly' ? form.month : undefined,
        account_scope: form.account_scope,
        category_scope: form.category_scope,
        account_ids: form.account_scope === 'selected' ? form.account_ids : undefined,
        category_ids: form.category_scope === 'selected' ? form.category_ids : undefined
      })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to save budget.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleAccount = (id: string) => {
    setForm(prev => ({
      ...prev,
      account_ids: prev.account_ids.includes(id)
        ? prev.account_ids.filter(item => item !== id)
        : [...prev.account_ids, id]
    }))
  }

  const toggleCategory = (id: string) => {
    setForm(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(id)
        ? prev.category_ids.filter(item => item !== id)
        : [...prev.category_ids, id]
    }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Budget' : 'Create Budget'}
      className="max-w-3xl"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Budget name</label>
            <Input
              placeholder="e.g. Monthly Essentials"
              value={form.name}
              onChange={(event) => setForm(prev => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Amount ({masterCurrency})</label>
            <Input
              type="number"
              min="0"
              placeholder="100000"
              value={form.amount}
              onChange={(event) => setForm(prev => ({ ...prev, amount: event.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Period</label>
            <Select
              value={form.period}
              onChange={(event) => setForm(prev => ({ ...prev, period: event.target.value as BudgetPeriod }))}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Year</label>
              <Select
                value={String(form.year)}
                onChange={(event) => setForm(prev => ({ ...prev, year: Number(event.target.value) }))}
              >
                {yearOptions.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </Select>
            </div>
            {form.period === 'monthly' && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Month</label>
                <Select
                  value={String(form.month)}
                  onChange={(event) => setForm(prev => ({ ...prev, month: Number(event.target.value) }))}
                >
                  {monthNames.map((name, index) => (
                    <option key={name} value={index + 1}>{name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Accounts in scope</p>
              <p className="text-xs text-muted-foreground">Pick which accounts this budget should track.</p>
            </div>
            <Select
              value={form.account_scope}
              onChange={(event) => {
                const value = event.target.value as BudgetAccountScope
                setForm(prev => ({
                  ...prev,
                  account_scope: value,
                  account_ids: value === 'selected' ? prev.account_ids : []
                }))
              }}
            >
              <option value="all">All accounts</option>
              <option value="cash">All cash accounts</option>
              <option value="selected">Select accounts</option>
            </Select>
          </div>

          {form.account_scope === 'selected' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {cashAccounts.map(account => (
                <label
                  key={account.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
                >
                  <span>{account.name}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={form.account_ids.includes(account.id)}
                    onChange={() => toggleAccount(account.id)}
                  />
                </label>
              ))}
              {cashAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No cash accounts available yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Categories in scope</p>
              <p className="text-xs text-muted-foreground">Choose the spending categories to include.</p>
            </div>
            <Select
              value={form.category_scope}
              onChange={(event) => {
                const value = event.target.value as BudgetCategoryScope
                setForm(prev => ({
                  ...prev,
                  category_scope: value,
                  category_ids: value === 'selected' ? prev.category_ids : []
                }))
              }}
            >
              <option value="all">All expense categories</option>
              <option value="selected">Select categories</option>
            </Select>
          </div>

          {form.category_scope === 'selected' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {expenseCategories.map(category => (
                <label
                  key={category.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span>{category.icon || '•'}</span>
                    <span>{category.name}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={form.category_ids.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                  />
                </label>
              ))}
              {expenseCategories.length === 0 && (
                <p className="text-xs text-muted-foreground">No expense categories yet.</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (initialData ? 'Update Budget' : 'Create Budget')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
