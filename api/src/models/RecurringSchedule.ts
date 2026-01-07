export interface RecurringSchedule {
  id: string
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number // 0-6 for weekly (0 = Sunday)
  day_of_month?: number // 1-31 for monthly
  account_id: string // For transactions: the account; For transfers: from_account
  to_account_id?: string // Only for transfers
  category_id?: string // Only for transactions
  amount: number
  amount_to?: number // Only for transfers with different currencies
  description?: string
  is_active: boolean
  created_at: number
  last_processed_date?: string // Last date when this was processed (YYYY-MM-DD)
  remaining_occurrences?: number // Number of times left to process (undefined = unlimited)
  end_date?: string // Date to stop processing (YYYY-MM-DD, undefined = no end date)
}
