export interface Transaction {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number // Optional: for investment transactions, frontend can provide the price
  linked_transaction_id?: string
  exclude_from_estimate?: boolean
  is_recurring?: boolean
}
