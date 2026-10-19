import type { Context } from 'hono'
import type { LegacyDetailsInput } from '../../../shared/legacy-investment-details'
import { validLocalDate } from '../../../shared/holding'
import { LegacyInvestmentDetailsService } from '../services/legacy-investment-details.service'
export class LegacyInvestmentDetailsController {
  constructor(private service: LegacyInvestmentDetailsService) {}
  private today(c: Context) {
    const d = c.req.header('X-Client-Date')
    return d && validLocalDate(d) ? d : new Date().toISOString().slice(0, 10)
  }
  async read(c: Context) {
    c.header('Cache-Control', 'no-store')
    return c.json(await this.service.read(c.req.param('id'), this.today(c)))
  }
  async save(c: Context) {
    return c.json(
      await this.service.save(
        c.req.param('id'),
        c.get('validatedBody') as LegacyDetailsInput,
        this.today(c),
      ),
    )
  }
}
