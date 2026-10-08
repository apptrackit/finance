export type AccountFormData = {
  name: string
  type: 'cash' | 'investment'
  balance: string
  currency: string
  quote_currency: string
  symbol: string
  asset_type: 'stock' | 'crypto' | 'manual'
  adjustWithTransaction: boolean
  exclude_from_net_worth: boolean
  exclude_from_cash_balance: boolean
}


export const accountCurrencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'MXN']
export const accountControlClass = 'h-9 rounded-[10px] bg-background'
