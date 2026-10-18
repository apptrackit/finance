import type { Context } from 'hono'
import type { TradeInput } from '../../../shared/investment-trade'
import { InvestmentTradeService } from '../services/investment-trade.service'
import { AppError } from '../errors/codes'
export class InvestmentTradeController {
  constructor(private service: InvestmentTradeService) {}
  async read(c: Context) {
    c.header('Cache-Control','no-store')
    return c.json(await this.service.readForEdit(c.req.param('id')))
  }
  async save(c: Context) {
    const result = await this.service.save(c.get('validatedBody') as TradeInput,c.req.header('X-Client-Date'),c.req.param('id'))
    return c.json(result,c.req.param('id')?200:201)
  }
  async delete(c: Context) {
    const version=c.req.query('expected_version')
    if(version!==undefined&&(!/^\d+$/.test(version)||!Number.isSafeInteger(Number(version))))throw AppError.validation('Invalid expected trade version')
    await this.service.remove(c.req.param('id'),c.req.header('X-Client-Date'),version===undefined?undefined:Number(version))
    return c.json({ success:true })
  }
}
