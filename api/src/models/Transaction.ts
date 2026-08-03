export type TransactionStatus = 'posted' | 'pending' | 'cancelled'
export type TransactionPendingKind = 'upcoming' | 'mcp_review'
export type TransactionReviewSource = 'manual' | 'chatgpt_mcp'

export interface Transaction {
  id: string
  account_id: string
  category_id?: string | null
  amount: number
  description?: string | null
  date: string
  price?: number // Optional: for investment transactions, frontend can provide the price
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  is_recurring?: boolean
  status?: TransactionStatus
  pending_kind?: TransactionPendingKind
  review_source?: TransactionReviewSource
  review_batch_id?: string | null
  review_flags?: string[]
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}
