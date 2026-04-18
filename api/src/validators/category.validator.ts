import { z } from 'zod'

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['income', 'expense']),
  icon: z.string().max(10).optional(),
})

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['income', 'expense']).optional(),
  icon: z.string().max(10).optional(),
})
