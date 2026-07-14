import { z } from 'zod'

const SUPPORTED_CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON']

function isValidAccountCurrency(data: { type?: 'cash' | 'investment', currency?: string, asset_type?: 'stock' | 'crypto' | 'manual' }) {
  if (!data.currency) return true

  if (data.type === 'cash' || data.asset_type === 'manual') {
    return SUPPORTED_CURRENCIES.includes(data.currency)
  }

  if (data.asset_type === 'stock') return data.currency === 'SHARE'
  if (data.asset_type === 'crypto') return /^[A-Z0-9]{2,20}$/.test(data.currency)

  // A request without an asset type cannot establish an investment-unit context.
  return SUPPORTED_CURRENCIES.includes(data.currency)
}

const accountCurrencyError = {
  message: `Cash and manual investment currencies must be one of: ${SUPPORTED_CURRENCIES.join(', ')}. Stocks use SHARE and crypto uses its ticker.`,
  path: ['currency']
} as const

export const CreateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['cash', 'investment']),
  balance: z.number().finite('Balance must be a finite number'),
  currency: z.string().toUpperCase().optional(),
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['stock', 'crypto', 'manual']).optional(),
  exclude_from_net_worth: z.boolean().optional(),
  exclude_from_cash_balance: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!isValidAccountCurrency(data)) ctx.addIssue({ code: 'custom', ...accountCurrencyError })
})

const SplitTransactionSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  amount: z.number().finite(),
  category_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
})

export const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['cash', 'investment']).optional(),
  balance: z.number().finite().optional(),
  currency: z.string().toUpperCase().optional(),
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['stock', 'crypto', 'manual']).optional(),
  exclude_from_net_worth: z.boolean().optional(),
  exclude_from_cash_balance: z.boolean().optional(),
  adjustWithTransaction: z.boolean().optional(),
  splitTransactions: z.array(SplitTransactionSchema).optional(),
}).superRefine((data, ctx) => {
  if (!isValidAccountCurrency(data)) {
    ctx.addIssue({ code: 'custom', ...accountCurrencyError })
  }
})
