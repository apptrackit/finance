export type AccountType = 'cash' | 'investment'
export type AssetType = 'stock' | 'crypto' | 'manual'

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number
  currency: string
  symbol?: string
  asset_type?: AssetType
  exclude_from_net_worth?: boolean
  exclude_from_cash_balance?: boolean
  updated_at: number
}
