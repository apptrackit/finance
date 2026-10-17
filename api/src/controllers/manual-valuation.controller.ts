import type { Context } from 'hono'
import type { ValuationInput } from '../../../shared/manual-valuation'
import { ManualValuationService } from '../services/manual-valuation.service'
export class ManualValuationController {
  constructor(private service: ManualValuationService) {}
  async history(c: Context) { return c.json(await this.service.history(c.req.param('id'),c.req.query(),c.req.header('X-Client-Date'))) }
  async save(c: Context) { return c.json(await this.service.save(c.req.param('id'),c.get('validatedBody') as ValuationInput,c.req.header('X-Client-Date'))) }
}
