export type Env = {
  DB: D1Database
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
  ALLOWED_EMAIL?: string
  DISABLE_ACCESS_AUTH?: string
}

export const MCP_WORKER_VERSION = '1.3.0'

export type AccountRow = {
  id: string
  name: string
  type: 'cash' | 'investment' | 'credit'
  balance: number
  currency: string
  symbol?: string | null
  asset_type?: 'stock' | 'crypto' | 'manual' | null
  exclude_from_net_worth?: number | boolean
  exclude_from_cash_balance?: number | boolean
  is_locked?: number | boolean
  updated_at?: number | null
}

export type TransactionRow = {
  id: string
  account_id: string
  category_id?: string | null
  amount: number
  description?: string | null
  date: string
  linked_transaction_id?: string | null
  exclude_from_estimate?: number | boolean
  is_recurring?: number | boolean
  status?: 'posted' | 'pending' | 'cancelled' | null
  pending_kind?: 'upcoming' | 'mcp_review' | null
  review_source?: 'manual' | 'chatgpt_mcp' | null
  review_batch_id?: string | null
  review_flags?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export type ReviewDraftType = 'income' | 'expense'

export type ReviewDraftInput = {
  type: ReviewDraftType
  amount: number
  account_id: string
  date: string
  category_id?: string | null
  description?: string | null
  exclude_from_estimate?: boolean
}

export type CanonicalReviewDraft = {
  draft_id: string
  type: ReviewDraftType
  amount: number
  signed_amount: number
  account_id: string
  category_id: string | null
  description: string | null
  date: string
  exclude_from_estimate: boolean
  review_flags: string[]
}

export type StoredReviewDraftProposal = {
  id: string
  proposal_hash: string
  items_json: string
  created_at: number
  expires_at: number
  consumed_at: number | null
}

export type RecurringScheduleRow = {
  id: string
  type: 'transaction' | 'transfer'
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_week?: number | null
  day_of_month?: number | null
  account_id: string
  to_account_id?: string | null
  category_id?: string | null
  amount: number
  amount_to?: number | null
  description?: string | null
  is_active: number | boolean
  created_at: number
  last_processed_date?: string | null
  remaining_occurrences?: number | null
  end_date?: string | null
}

export type InvestmentTransactionRow = {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string | null
  created_at?: number | null
}

export type CategoryRow = {
  id: string
  name: string
  icon?: string | null
  type: 'income' | 'expense'
}

export type JsonRpcRequest = {
  jsonrpc?: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}
