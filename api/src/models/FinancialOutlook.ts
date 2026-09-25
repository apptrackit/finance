export type FinancialOutlookRange = { low: number; expected: number; high: number }

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

export interface FinancialOutlookSnapshot {
  id: string
  schema_version: number
  currency: 'HUF'
  source_revision: number
  source_queried_at: string
  created_at: string
  headline: string
  data_quality: {
    score: number
    label: 'high' | 'moderate' | 'limited'
    reasons: string[]
  }
  source_coverage: Record<string, unknown>
  horizons: FinancialOutlookHorizon[]
  cash_balance_path: FinancialOutlookCashPathPoint[]
  cash_balance_history: FinancialOutlookHistoricalCashPoint[]
  cash_balance_history_year: FinancialOutlookHistoricalCashPoint[]
  cash_balance_history_alltime: FinancialOutlookHistoricalCashPoint[]
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

export type FinancialOutlookSnapshotRow = {
  id: string
  schema_version: number
  currency: 'HUF'
  source_revision: number
  source_queried_at: string
  created_at: number
  headline: string
  data_quality_score: number
  data_quality_label: 'high' | 'moderate' | 'limited'
  payload: string
  source_coverage: string
}
