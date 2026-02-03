export type BudgetPeriod = 'monthly' | 'yearly'
export type BudgetAccountScope = 'all' | 'cash' | 'selected'
export type BudgetCategoryScope = 'all' | 'selected'

export type Budget = {
  id: string
  name?: string
  amount: number
  period: BudgetPeriod
  start_date: string
  end_date: string
  account_scope: BudgetAccountScope
  category_scope: BudgetCategoryScope
  currency?: string
  created_at: number
  updated_at: number
  account_ids: string[]
  category_ids: string[]
}

export type BudgetFormData = {
  name: string
  amount: string
  period: BudgetPeriod
  year: number
  month: number
  account_scope: BudgetAccountScope
  category_scope: BudgetCategoryScope
  account_ids: string[]
  category_ids: string[]
}
