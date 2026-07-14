import { TransactionStatus } from '../models/Transaction'

export interface CreateTransactionDto {
  account_id: string
  category_id?: string | null
  amount: number
  description?: string | null
  date: string
  price?: number
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  status?: Extract<TransactionStatus, 'pending' | 'posted'>
}

export interface UpdateTransactionDto {
  account_id?: string
  to_account_id?: string
  category_id?: string | null
  amount?: number
  amount_to?: number
  price?: number
  description?: string | null
  date?: string
  exclude_from_estimate?: boolean
}

export interface TransactionResponseDto {
  id: string
  account_id: string
  category_id?: string | null
  amount: number
  description?: string | null
  date: string
  price?: number
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  is_recurring?: boolean
  status: TransactionStatus
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}
