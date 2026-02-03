import { parseISO, format } from 'date-fns'
import type { Budget } from './types'

export const formatBudgetPeriod = (budget: Budget) => {
  const start = parseISO(budget.start_date)
  if (budget.period === 'monthly') {
    return format(start, 'MMMM yyyy')
  }
  return format(start, 'yyyy')
}

export const getBudgetLabel = (budget: Budget) => {
  if (budget.name && budget.name.trim().length > 0) {
    return budget.name
  }
  return budget.period === 'monthly' ? 'Monthly Budget' : 'Yearly Budget'
}

export const formatScopeLabel = (budget: Budget) => {
  if (budget.account_scope === 'cash') return 'Cash accounts'
  if (budget.account_scope === 'selected') return 'Selected accounts'
  return 'All accounts'
}

export const formatCategoryScopeLabel = (budget: Budget) => {
  if (budget.category_scope === 'selected') return 'Selected categories'
  return 'All categories'
}
