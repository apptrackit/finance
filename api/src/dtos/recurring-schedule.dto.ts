export interface CreateRecurringScheduleDto {
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number // 0-6 for weekly (0 = Sunday)
  day_of_month?: number // 1-31 for monthly
  account_id: string
  to_account_id?: string // For transfers
  category_id?: string // For transactions
  amount: number
  amount_to?: number // For transfers with different currencies
  description?: string
  remaining_occurrences?: number // Number of times to process (undefined = unlimited)
  end_date?: string // End date YYYY-MM-DD (undefined = no end date)
}

export interface UpdateRecurringScheduleDto {
  frequency?: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  account_id?: string
  to_account_id?: string
  category_id?: string
  amount?: number
  amount_to?: number
  description?: string
  is_active?: boolean
  remaining_occurrences?: number // Number of times left to process
  end_date?: string // End date YYYY-MM-DD
}

export interface RecurringScheduleResponseDto {
  id: string
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  account_id: string
  to_account_id?: string
  category_id?: string
  amount: number
  amount_to?: number
  description?: string
  is_active: boolean
  created_at: number
  last_processed_date?: string
  remaining_occurrences?: number
  end_date?: string
}
