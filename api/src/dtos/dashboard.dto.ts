export interface NetWorthResponseDto {
  net_worth: number
  currency: string
  accounts: AccountNetWorth[]
  rates_fetched: boolean
}

export interface AccountNetWorth {
  id: string
  balance: number
  currency: string
  balance_in_master: number
}

export interface SpendingEstimateResponseDto {
  period: 'week' | 'month'
  estimate_amount: number
  currency: string
  confidence_level: number // 0-100
  historical_average_recent: number // 3-6 months average
  historical_average_full: number // Full history average
  variance_percentage: number // vs historical average
  week_of_month?: number // 1-4+ for weekly estimates
  breakdown: {
    recurring: number
    non_recurring: number
  }
  category_breakdown: CategoryEstimate[]
}

export interface CategoryEstimate {
  category_id: string
  category_name: string
  estimate_amount: number
  historical_average: number
}
