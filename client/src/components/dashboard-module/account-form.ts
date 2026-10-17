export type AccountFormData = {
  name: string
  type: 'cash' | 'investment'
  balance: string
  currency: string
  quote_currency: string
  symbol: string
  asset_type: 'etf' | 'stock' | 'crypto' | 'manual'
  pricing_method?: 'market' | 'manual'
  exchange?: string
  manual_price?: string
  manual_price_date?: string
  opening_date?: string
  opening_balance?: string
  opening_cost?: string
  opening_cost_currency?: string
  manual_owned?: boolean
  confirm_opening?: boolean
  adjustWithTransaction: boolean
  exclude_from_net_worth: boolean
  exclude_from_cash_balance: boolean
}


export const accountCurrencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'MXN']
export const accountControlClass = 'h-9 rounded-[10px] bg-background'

export const localAccountDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const holdingFormDefaults = () => ({ pricing_method: 'market' as const, exchange: '', manual_price: '', manual_price_date: localAccountDate(),
  opening_date: localAccountDate(), opening_balance: '', opening_cost: '', opening_cost_currency: '', confirm_opening: false })
