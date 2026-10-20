import { z } from 'zod'
import { validLocalDate, validHoldingNumber } from '../../../shared/holding'

const SUPPORTED_CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON', 'MXN']

function isValidAccountCurrency(data: { type?: 'cash' | 'investment', currency?: string, asset_type?: 'etf' | 'stock' | 'crypto' | 'manual' }) {
  if (!data.currency) return true

  if (data.type === 'cash' || data.asset_type === 'manual') {
    return SUPPORTED_CURRENCIES.includes(data.currency)
  }

  if (data.asset_type === 'stock' || data.asset_type === 'etf') return data.currency === 'SHARE'
  if (data.asset_type === 'crypto') return /^[A-Z0-9]{2,20}$/.test(data.currency)

  // A request without an asset type cannot establish an investment-unit context.
  return SUPPORTED_CURRENCIES.includes(data.currency)
}

const accountCurrencyError = {
  message: `Cash and manual investment currencies must be one of: ${SUPPORTED_CURRENCIES.join(', ')}. Stocks use SHARE and crypto uses its ticker.`,
  path: ['currency']
}
const quoteCurrencySchema = z.string().toUpperCase().refine(c => SUPPORTED_CURRENCIES.includes(c), {
  message: `Quote currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
}).optional()

const dateSchema = z.string().refine(validLocalDate, 'Use a valid YYYY-MM-DD date')
const holdingFields = {
  pricing_method: z.enum(['market', 'manual']).optional(),
  provider: z.literal('yahoo').nullable().optional(),
  exchange: z.string().trim().max(40).nullable().optional(),
  manual_price: z.number().refine(validHoldingNumber, 'Use a nonnegative price with at most 12 decimal and 15 significant digits').nullable().optional(),
  manual_price_date: dateSchema.nullable().optional(),
  opening: z.object({
    owned: z.boolean().optional(),
    balance: z.number().refine(validHoldingNumber, 'Use a nonnegative opening amount with at most 12 decimal and 15 significant digits'),
    date: dateSchema,
    cost_amount: z.number().finite().min(0).max(1e12).nullable().optional(),
    cost_currency: quoteCurrencySchema.nullable(),
  }).optional().refine(v => !v || (v.cost_amount == null) === (v.cost_currency == null), 'Known opening cost needs its currency'),
}

export const CreateAccountSchema = z.object({
  ...holdingFields,
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: z.enum(['cash', 'investment']),
  balance: z.number().finite('Balance must be a finite number'),
  currency: z.string().toUpperCase().optional(),
  quote_currency: quoteCurrencySchema,
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['etf', 'stock', 'crypto', 'manual']).optional(),
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
  ...holdingFields,
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['cash', 'investment']).optional(),
  balance: z.number().finite().optional(),
  currency: z.string().toUpperCase().optional(),
  quote_currency: quoteCurrencySchema,
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['etf', 'stock', 'crypto', 'manual']).optional(),
  exclude_from_net_worth: z.boolean().optional(),
  exclude_from_cash_balance: z.boolean().optional(),
  expected_balance: z.number().finite().optional(),
  expected_updated_at: z.number().finite().optional(),
  correction_date: dateSchema.optional(),
  adjustWithTransaction: z.boolean().optional(),
  splitTransactions: z.array(SplitTransactionSchema).optional(),
}).superRefine((data, ctx) => {
  if (!isValidAccountCurrency(data)) {
    ctx.addIssue({ code: 'custom', ...accountCurrencyError })
  }
})
