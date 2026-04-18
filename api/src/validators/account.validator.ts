import { z } from 'zod'

const SUPPORTED_CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON']

export const CreateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['cash', 'investment']),
  balance: z.number().finite('Balance must be a finite number'),
  currency: z.string().toUpperCase().refine(c => SUPPORTED_CURRENCIES.includes(c), {
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
  }).optional(),
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['stock', 'crypto', 'manual']).optional(),
  exclude_from_net_worth: z.boolean().optional(),
  exclude_from_cash_balance: z.boolean().optional(),
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
  currency: z.string().toUpperCase().refine(c => SUPPORTED_CURRENCIES.includes(c), {
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
  }).optional(),
  symbol: z.string().max(20).optional(),
  asset_type: z.enum(['stock', 'crypto', 'manual']).optional(),
  exclude_from_net_worth: z.boolean().optional(),
  exclude_from_cash_balance: z.boolean().optional(),
  adjustWithTransaction: z.boolean().optional(),
  splitTransactions: z.array(SplitTransactionSchema).optional(),
})
