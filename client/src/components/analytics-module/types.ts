export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  linked_transaction_id?: string
}

export type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

export type Account = {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  icon?: string
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
}

export type TimePeriod = 'thisYear' | 'lastYear' | 'allTime' | 'custom'

export type SpendingEstimate = {
  estimate_amount: number
  confidence_level: number
  week_of_month?: number
  current_period_actual: number
  previous_period_actual: number
}

export type ChartDataPoint = {
  key: string
  label: string
  amount: number
}

export type TrendDataPoint = {
  date: string
  formattedDate: string
  balance: number
}
