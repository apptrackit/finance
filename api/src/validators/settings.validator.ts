import { z } from 'zod'

export const UpdateNavigationSettingsSchema = z.object({
  visible_menus: z.object({
    dashboard: z.boolean().optional(),
    accounts: z.boolean().optional(),
    analytics: z.boolean().optional(),
    investments: z.boolean().optional(),
    recurring: z.boolean().optional(),
  }).strict(),
}).strict()
