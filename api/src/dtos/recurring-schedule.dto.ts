export interface CreateRecurringScheduleDto {
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_week?: number // 0-6 for weekly (0 = Sunday)
  day_of_month?: number // 1-31 for monthly and yearly
  month?: number // 0-11 for yearly (0 = January)
  account_id: string
  to_account_id?: string // For transfers
  category_id?: string // For transactions
  amount: number
  amount_to?: number // For transfers with different currencies
  description?: string
  remaining_occurrences?: number | null // Number of times to process (undefined/null = unlimited)
  end_date?: string | null // End date YYYY-MM-DD (undefined/null = no end date)
}

export interface UpdateRecurringScheduleDto {
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_week?: number
  day_of_month?: number
  month?: number
  account_id?: string
  to_account_id?: string
  category_id?: string
  amount?: number
  amount_to?: number
  description?: string
  is_active?: boolean
  remaining_occurrences?: number | null // Number of times left to process (null = clear/unlimited)
  end_date?: string | null // End date YYYY-MM-DD (null = clear/no end date)
}

export interface RecurringScheduleResponseDto {
  id: string
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_week?: number
  day_of_month?: number
  month?: number
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
