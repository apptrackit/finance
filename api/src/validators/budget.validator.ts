import { z } from 'zod'

export const CreateBudgetSchema = z.object({
  name: z.string().max(100).optional(),
  amount: z.number().positive('Amount must be positive'),
  period: z.enum(['monthly', 'yearly']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  account_scope: z.enum(['all', 'cash', 'selected']),
  category_scope: z.enum(['all', 'selected']),
  account_ids: z.array(z.string()).optional(),
  category_ids: z.array(z.string()).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
})

export const UpdateBudgetSchema = CreateBudgetSchema.partial()
