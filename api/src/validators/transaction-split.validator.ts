import { z } from 'zod'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
export const MAX_SPLIT_LINES = 50

const SplitLineSchema = z.object({
  category_id: z.string().min(1).nullable(),
  amount: z.number().finite('Amount must be a finite number').refine(n => n !== 0, 'Amount cannot be zero'),
  note: z.string().max(500).nullable().optional(),
}).strict()

const splitFields = {
  account_id: z.string().min(1, 'account_id is required'),
  date: z.string().regex(dateRegex, 'Date must be YYYY-MM-DD'),
  description: z.string().max(500).nullable().optional(),
  exclude_from_estimate: z.boolean().optional(),
  balance_adjustment: z.object({
    expected_balance: z.number().finite(),
    new_balance: z.number().finite(),
  }).strict().optional(),
}

export const SaveSplitSchema = z.object({
  ...splitFields,
  lines: z.array(SplitLineSchema).min(2, 'A split needs at least two lines').max(MAX_SPLIT_LINES),
}).strict()

// Replacing a split with a single line turns it back into an ordinary transaction ("undo split").
export const UpdateSplitSchema = z.object({
  ...splitFields,
  lines: z.array(SplitLineSchema).min(1).max(MAX_SPLIT_LINES),
}).strict()
