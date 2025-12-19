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
  updated_at: number
}
