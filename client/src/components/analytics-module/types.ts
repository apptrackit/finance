import type { PendingKind, ReviewSource } from '../../lib/transaction-review'

export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  linked_transaction_id?: string
  status?: 'posted' | 'pending' | 'cancelled'
  pending_kind?: PendingKind | null
  review_source?: ReviewSource | null
  review_batch_id?: string | null
  review_flags?: unknown
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

export type TimePeriod = 'allTime' | 'month' | 'year'

export type FinancialOutlookRange = {
  low: number
  expected: number
  high: number
}

export type FinancialOutlookHorizon = {
  days: 7 | 30 | 90
  cash_balance: FinancialOutlookRange
}

export type FinancialOutlookCashPathPoint = FinancialOutlookRange & {
  day: number
}

export type FinancialOutlookHistoricalCashPoint = {
  date: string
  balance: number
}

export type FinancialOutlookSnapshot = {
  id: string
  currency: 'HUF'
  source_revision: number
  source_queried_at: string
  created_at: string
  headline: string
  data_quality: { score: number; label: 'high' | 'moderate' | 'limited'; reasons: string[] }
  source_coverage: Record<string, unknown>
  horizons: FinancialOutlookHorizon[]
  cash_balance_path: FinancialOutlookCashPathPoint[]
  cash_balance_history: FinancialOutlookHistoricalCashPoint[]
  drivers: string[]
  risks: string[]
  assumptions: string[]
  suggestions: string[]
  freshness: {
    status: 'up_to_date' | 'data_changed' | 'refresh_recommended' | 'partially_expired' | 'historical'
    data_changed: boolean
    age_days: number
    active_horizons: number[]
    expired_horizons: number[]
    regeneration_recommended: boolean
  }
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
  smoothed?: number
}
