import { z } from 'zod'

export const CreateTransferSchema = z.object({
  from_account_id: z.string().min(1, 'from_account_id is required'),
  to_account_id: z.string().min(1, 'to_account_id is required'),
  amount_from: z.number().positive('amount_from must be positive'),
  amount_to: z.number().positive('amount_to must be positive'),
  fee: z.number().min(0).optional(),
  exchange_rate: z.number().positive().nullish(),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  price: z.number().positive().nullish(),
}).refine(data => data.from_account_id !== data.to_account_id, {
  message: 'from_account_id and to_account_id must be different',
  path: ['to_account_id'],
})
