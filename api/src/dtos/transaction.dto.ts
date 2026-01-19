export interface CreateTransactionDto {
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
}

export interface UpdateTransactionDto {
  account_id?: string
  category_id?: string
  amount?: number
  description?: string
  date?: string
  exclude_from_estimate?: boolean
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
}
