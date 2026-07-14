import { z } from 'zod'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const CreateTransactionSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  category_id: z.string().nullable().optional(),
  amount: z.number().finite('Amount must be a finite number').refine(n => n !== 0, 'Amount cannot be zero'),
  description: z.string().max(500).optional(),
  date: z.string().regex(dateRegex, 'Date must be YYYY-MM-DD'),
  price: z.number().positive().optional(),
  linked_transaction_id: z.string().optional(),
  exclude_from_estimate: z.boolean().optional(),
  status: z.enum(['posted', 'pending']).optional(),
})

export const UpdateTransactionSchema = z.object({
  account_id: z.string().min(1).optional(),
  to_account_id: z.string().min(1).optional(),
  category_id: z.string().nullable().optional(),
  amount: z.number().finite().refine(n => n !== 0, 'Amount cannot be zero').optional(),
  amount_to: z.number().finite().positive('amount_to must be positive').optional(),
  price: z.number().finite().positive('price must be positive').optional(),
  description: z.string().max(500).nullable().optional(),
  date: z.string().regex(dateRegex, 'Date must be YYYY-MM-DD').optional(),
  exclude_from_estimate: z.boolean().optional(),
}).refine(data => !data.account_id || !data.to_account_id || data.account_id !== data.to_account_id, {
  message: 'account_id and to_account_id must be different',
  path: ['to_account_id'],
})
