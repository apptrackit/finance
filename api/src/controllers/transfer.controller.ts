import { Context } from 'hono'
import { TransferService } from '../services/transfer.service'
import { CreateTransferDto } from '../dtos/transfer.dto'

export class TransferController {
  constructor(private transferService: TransferService) {}

  async getExchangeRate(c: Context) {
    try {
      const fromCurrency = c.req.query('from')
      const toCurrency = c.req.query('to')

      if (!fromCurrency || !toCurrency) {
        return c.json({ error: 'Missing from or to currency' }, 400)
      }

      const result = await this.transferService.getExchangeRate(fromCurrency, toCurrency)
      return c.json(result)
    } catch (error: any) {
      return c.json({ error: error.message }, 404)
    }
  }

  async create(c: Context) {
    try {
      const body = await c.req.json<CreateTransferDto>()
      const transfer = await this.transferService.createTransfer(body)
      return c.json(transfer, 201)
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400
      return c.json({ error: error.message }, status)
    }
  }
}
