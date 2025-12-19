import { Context } from 'hono'
import { InvestmentTransactionService } from '../services/investment-transaction.service'
import { InvestmentTransactionMapper } from '../mappers/investment-transaction.mapper'
import { CreateInvestmentTransactionDto } from '../dtos/investment-transaction.dto'

export class InvestmentTransactionController {
  constructor(private investmentTransactionService: InvestmentTransactionService) {}

  async getAll(c: Context) {
    const accountId = c.req.query('account_id')
    const transactions = await this.investmentTransactionService.getInvestmentTransactions(accountId)
    return c.json(transactions.map(InvestmentTransactionMapper.toResponseDto))
  }

  async create(c: Context) {
    try {
      const body = await c.req.json<CreateInvestmentTransactionDto>()
      const transaction = await this.investmentTransactionService.createInvestmentTransaction(body)
      return c.json(InvestmentTransactionMapper.toResponseDto(transaction), 201)
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400
      return c.json({ error: error.message }, status)
    }
  }

  async delete(c: Context) {
    try {
      const id = c.req.param('id')
      await this.investmentTransactionService.deleteInvestmentTransaction(id)
      return c.json({ success: true })
    } catch (error: any) {
      console.error('Delete investment transaction error:', error)
      return c.json({ error: error.message || 'Internal server error' }, 500)
    }
  }
}
