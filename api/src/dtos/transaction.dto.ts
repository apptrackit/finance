export type TransactionStatusDto = 'posted' | 'pending' | 'cancelled'

export interface CreateTransactionDto {
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  status?: Extract<TransactionStatusDto, 'posted' | 'pending'>
}

export interface UpdateTransactionDto {
  account_id?: string
  category_id?: string
  amount?: number
  description?: string
  date?: string
  exclude_from_estimate?: boolean
  status?: Extract<TransactionStatusDto, 'posted' | 'pending'>
}

export interface TransactionResponseDto {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  is_recurring?: boolean
  status: TransactionStatusDto
  confirmed_at?: number | null
  cancelled_at?: number | null
  created_at?: number | null
  updated_at?: number | null
}
