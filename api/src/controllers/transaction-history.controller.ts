import type { Context } from 'hono'
import { TransactionHistoryService } from '../services/transaction-history.service'

export class TransactionHistoryController {
  constructor(private service: TransactionHistoryService) {}
  async getPage(c: Context) {
    return c.json(await this.service.getPage(c.req.query()))
  }
}
