export type Account = {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}

export type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
}

export type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}
