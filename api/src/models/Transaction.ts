export interface Transaction {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  price?: number // Optional: for investment transactions, frontend can provide the price
  is_recurring: boolean
  linked_transaction_id?: string
}
