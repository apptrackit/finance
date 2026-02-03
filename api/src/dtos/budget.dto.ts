import { BudgetAccountScope, BudgetCategoryScope, BudgetPeriod } from '../models/Budget'

export interface CreateBudgetDto {
  name?: string
  amount: number
  period: BudgetPeriod
  year: number
  month?: number
  account_scope: BudgetAccountScope
  category_scope: BudgetCategoryScope
  account_ids?: string[]
  category_ids?: string[]
  currency?: string
}

export interface UpdateBudgetDto {
  name?: string
  amount?: number
  period?: BudgetPeriod
  year?: number
  month?: number
  account_scope?: BudgetAccountScope
  category_scope?: BudgetCategoryScope
  account_ids?: string[]
  category_ids?: string[]
  currency?: string
}

export interface BudgetResponseDto {
  id: string
  name?: string
  amount: number
  period: BudgetPeriod
  start_date: string
  end_date: string
  account_scope: BudgetAccountScope
  category_scope: BudgetCategoryScope
  account_ids: string[]
  category_ids: string[]
  currency?: string
  created_at: number
  updated_at: number
}
