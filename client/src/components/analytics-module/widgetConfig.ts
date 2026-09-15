export type WidgetId =
  | 'summary-cards'
  | 'cash-balance-trend'
  | 'cash-balance-forecast'
  | 'income-chart'
  | 'expenses-chart'
  | 'income-expenses-trend'
  | 'account-trends'
  | 'income-breakdown'
  | 'spending-breakdown'
  | 'money-map'
  | 'top-expenses'
  | 'ai-financial-forecast'

export interface WidgetDef {
  id: WidgetId
  label: string
  description: string
  defaultVisible: boolean
  note?: string
}

export const WIDGET_DEFS: WidgetDef[] = [
  {
    id: 'summary-cards',
    label: 'Summary Cards',
    description: 'Income, expenses, and net flow totals at a glance',
    defaultVisible: true,
  },
  {
    id: 'cash-balance-trend',
    label: 'Cash Balance Trend',
    description: 'Historical cash balance over time with a smoothed trend line',
    defaultVisible: true,
  },
  {
    id: 'cash-balance-forecast',
    label: 'Cash Balance Forecast',
    description: '3-month projection using seasonal pattern analysis',
    defaultVisible: true,
    note: 'Only appears in the current-month view',
  },
  {
    id: 'income-chart',
    label: 'Income Chart',
    description: 'Income over time by week or month, filterable by category',
    defaultVisible: true,
  },
  {
    id: 'expenses-chart',
    label: 'Expenses Chart',
    description: 'Expenses over time by week or month, filterable by category',
    defaultVisible: true,
  },
  {
    id: 'income-expenses-trend',
    label: 'Income vs Expenses Trend',
    description: 'Income, expenses, and net income together over the selected period',
    defaultVisible: true,
  },
  {
    id: 'account-trends',
    label: 'Account Trends',
    description: 'Individual balance history chart for each of your accounts',
    defaultVisible: true,
  },
  {
    id: 'income-breakdown',
    label: 'Income Breakdown',
    description: 'Income distribution across categories as a pie chart',
    defaultVisible: true,
  },
  {
    id: 'spending-breakdown',
    label: 'Spending Breakdown',
    description: 'Expense distribution across categories as a pie chart',
    defaultVisible: true,
  },
  {
    id: 'money-map',
    label: 'Money Map',
    description: 'Interactive flow of income through spending and surplus',
    defaultVisible: true,
  },
  {
    id: 'top-expenses',
    label: 'Top Expenses',
    description: 'Your 5 largest transactions for the selected period',
    defaultVisible: true,
  },
  {
    id: 'ai-financial-forecast',
    label: 'AI Financial Forecast',
    description: 'AI-generated 7-, 30-, and 90-day cash forecast with report history',
    defaultVisible: true,
    note: 'Independent of the selected date range',
  },
]

const STORAGE_KEY = 'analytics-widget-visibility'

export function loadWidgetVisibility(): Record<WidgetId, boolean> {
  const defaults = Object.fromEntries(
    WIDGET_DEFS.map(w => [w.id, w.defaultVisible])
  ) as Record<WidgetId, boolean>

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaults, ...parsed }
    }
  } catch {}

  return defaults
}

export function saveWidgetVisibility(visibility: Record<WidgetId, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility))
  } catch {}
}
