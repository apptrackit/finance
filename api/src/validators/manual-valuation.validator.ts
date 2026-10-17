import { z } from 'zod'
import { validHoldingNumber, validLocalDate } from '../../../shared/holding'
export const ManualValuationSchema = z.object({
  effective_date: z.string().refine(validLocalDate,'Use a valid YYYY-MM-DD date'),
  amount: z.number().refine(validHoldingNumber,'Use a nonnegative value with at most 12 decimal and 15 significant digits (maximum 1 trillion)'),
  expected_id: z.string().min(1).nullable(),
  expected_version: z.number().int().nonnegative(),
}).strict()
