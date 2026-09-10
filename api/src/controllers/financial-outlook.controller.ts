import { Context } from 'hono'
import { AppError } from '../errors/codes'
import { FinancialOutlookService } from '../services/financial-outlook.service'

function parseCursor(value?: string) {
  if (!value) return undefined
  const separator = value.indexOf(':')
  const createdAt = Number(value.slice(0, separator))
  const id = value.slice(separator + 1)
  if (separator < 1 || !Number.isInteger(createdAt) || !id || id.length > 128) throw AppError.validation('Invalid financial outlook history cursor')
  return { createdAt, id }
}

export class FinancialOutlookController {
  constructor(private service: FinancialOutlookService) {}

  async getLatest(c: Context) {
    return c.json({ snapshot: await this.service.getLatest() })
  }

  async getHistory(c: Context) {
    const requestedLimit = Number(c.req.query('limit') || 20)
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) throw AppError.validation('limit must be an integer from 1 to 50')
    return c.json(await this.service.getHistory(requestedLimit, parseCursor(c.req.query('cursor'))))
  }
}
