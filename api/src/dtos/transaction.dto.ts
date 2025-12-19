export interface CreateTransactionDto {
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number
  is_recurring: boolean
  linked_transaction_id?: string
}

export interface UpdateTransactionDto {
  account_id?: string
  category_id?: string
  amount?: number
  description?: string
  date?: string
  is_recurring?: boolean
}

export interface TransactionResponseDto {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number
  is_recurring: boolean
  linked_transaction_id?: string
}
