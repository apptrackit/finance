import { useEffect, useMemo, useState } from 'react'
import { PiggyBank, Plus, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '../common/card'
import { Button } from '../common/button'
import { API_BASE_URL, apiFetch } from '../../config'
import { BudgetCard } from './BudgetCard'
import { BudgetFormModal } from './BudgetFormModal'
import type { Budget } from './types'
import { formatBudgetPeriod } from './utils'
import { convertToMasterCurrency as convertUtil } from '../analytics-module/utils'

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
  currency: string
  balance: number
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  date: string
  linked_transaction_id?: string
}

type BudgetProps = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  masterCurrency: string
}

export function Budget({ accounts, categories, transactions, masterCurrency }: BudgetProps) {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})

  const fetchBudgets = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE_URL}/budgets`)
      if (!res.ok) {
        throw new Error('Failed to load budgets')
      }
      const data = await res.json()
      setBudgets(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBudgets()
  }, [])

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`)
        const data = await response.json()
        if (data.rates) {
          setExchangeRates(data.rates)
        }
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err)
      }
    }
    fetchRates()
  }, [masterCurrency])

  const convertToMasterCurrency = (amount: number, accountId: string) => {
    return convertUtil(amount, accountId, accounts, exchangeRates, masterCurrency)
  }

  const getBudgetAccountIds = (budget: Budget) => {
    if (budget.account_scope === 'selected') {
      return budget.account_ids
    }
    if (budget.account_scope === 'all') {
      return accounts.filter(account => account.type !== 'investment').map(account => account.id)
    }
    return accounts.filter(account => account.type === 'cash').map(account => account.id)
  }

  const getBudgetCategoryIds = (budget: Budget) => {
    if (budget.category_scope === 'selected') {
      return budget.category_ids
    }
    return categories.filter(category => category.type === 'expense').map(category => category.id)
  }

  const budgetSpendMap = useMemo(() => {
    const map = new Map<string, number>()
    budgets.forEach(budget => {
      const accountIds = new Set(getBudgetAccountIds(budget))
      const categoryIds = new Set(getBudgetCategoryIds(budget))

      const spent = transactions
        .filter(tx => tx.amount < 0 && !tx.linked_transaction_id)
        .filter(tx => tx.date >= budget.start_date && tx.date <= budget.end_date)
        .filter(tx => accountIds.has(tx.account_id))
        .filter(tx => {
          if (budget.category_scope === 'selected') {
            return tx.category_id ? categoryIds.has(tx.category_id) : false
          }
          return true
        })
        .reduce((sum, tx) => {
          return sum + Math.abs(convertToMasterCurrency(tx.amount, tx.account_id))
        }, 0)

      map.set(budget.id, spent)
    })
    return map
  }, [budgets, transactions, accounts, categories, exchangeRates, masterCurrency])

  const activeBudgets = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return budgets.filter(budget => budget.start_date <= today && budget.end_date >= today)
  }, [budgets])

  const handleSaveBudget = async (payload: {
    name?: string
    amount: number
    period: 'monthly' | 'yearly'
    year: number
    month?: number
    account_scope: 'all' | 'cash' | 'selected'
    category_scope: 'all' | 'selected'
    account_ids?: string[]
    category_ids?: string[]
  }) => {
    const payloadWithCurrency = {
      ...payload,
      currency: masterCurrency
    }
    if (editingBudget) {
      const res = await apiFetch(`${API_BASE_URL}/budgets/${editingBudget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithCurrency)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update budget')
      }
    } else {
      const res = await apiFetch(`${API_BASE_URL}/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithCurrency)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to create budget')
      }
    }

    await fetchBudgets()
    setEditingBudget(null)
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setIsModalOpen(true)
  }

  const handleDelete = async (budget: Budget) => {
    const confirmed = window.confirm(`Delete "${budget.name || formatBudgetPeriod(budget)}" budget?`)
    if (!confirmed) return
    setDeletingId(budget.id)
    try {
      const res = await apiFetch(`${API_BASE_URL}/budgets/${budget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete budget')
      }
      await fetchBudgets()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete budget')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PiggyBank className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Budgets</h2>
            <p className="text-sm text-muted-foreground/70">
              {activeBudgets.length} {activeBudgets.length === 1 ? 'budget' : 'budgets'} active
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={fetchBudgets} disabled={loading} className="h-9 w-9">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => { setEditingBudget(null); setIsModalOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            New Budget
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map(item => (
            <Card key={item} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold">No budgets yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first budget to stay on top of spending.
              </p>
            </div>
            <Button onClick={() => { setEditingBudget(null); setIsModalOpen(true) }}>
              <Plus className="h-4 w-4" />
              Create Budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {budgets.map(budget => {
            const spent = budgetSpendMap.get(budget.id) || 0
            const progress = budget.amount > 0 ? spent / budget.amount : 0
            return (
              <BudgetCard
                key={budget.id}
                budget={budget}
                spent={spent}
                progress={progress}
                currency={budget.currency || masterCurrency}
                onEdit={handleEdit}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            )
          })}
        </div>
      )}

      <BudgetFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveBudget}
        accounts={accounts}
        categories={categories}
        initialData={editingBudget}
        masterCurrency={masterCurrency}
      />
    </div>
  )
}
