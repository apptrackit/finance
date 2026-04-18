import { Context, Next } from 'hono'
import { z, ZodSchema } from 'zod'

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, 400)
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.map(String).join('.'),
        message: e.message,
      }))
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors }, 400)
    }

    c.set('validatedBody', result.data)
    await next()
  }
}
