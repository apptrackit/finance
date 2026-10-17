import type { Context } from 'hono'
import type { TradeInput } from '../../../shared/investment-trade'
import { InvestmentTradeService } from '../services/investment-trade.service'
export class InvestmentTradeController {
  constructor(private service: InvestmentTradeService) {}
  async save(c: Context) {
    const result = await this.service.save(c.get('validatedBody') as TradeInput,c.req.header('X-Client-Date'),c.req.param('id'))
    return c.json(result,c.req.param('id')?200:201)
  }
  async delete(c: Context) {
    await this.service.remove(c.req.param('id'),c.req.header('X-Client-Date'))
    return c.json({ success:true })
  }
}
