import { z } from 'zod'

export const CreateRecurringScheduleSchema = z.object({
  type: z.enum(['transaction', 'transfer']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(0).max(11).optional(),
  account_id: z.string().min(1, 'account_id is required'),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  amount: z.number().finite().refine(n => n !== 0, 'Amount cannot be zero'),
  amount_to: z.number().finite().optional(),
  description: z.string().max(500).optional(),
  remaining_occurrences: z.number().int().positive().nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export const UpdateRecurringScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(0).max(11).optional(),
  account_id: z.string().optional(),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  amount: z.number().finite().optional(),
  amount_to: z.number().finite().optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
  remaining_occurrences: z.number().int().positive().nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})
