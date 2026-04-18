import { Context } from 'hono'
import { TransactionService } from '../services/transaction.service'
import { TransactionMapper } from '../mappers/transaction.mapper'
import { CreateTransactionDto, UpdateTransactionDto } from '../dtos/transaction.dto'
import { PaginationParams } from '../models/Pagination'
import { AuditRepository } from '../repositories/audit.repository'
import { Bindings } from '../types/environment.types'

export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  async getAll(c: Context) {
    const transactions = await this.transactionService.getAllTransactions()
    return c.json(transactions.map(TransactionMapper.toResponseDto))
  }

  async create(c: Context<{ Bindings: Bindings }>) {
    try {
      const body = await c.req.json<CreateTransactionDto>()
      const result = await this.transactionService.createTransaction(body)

      // Handle investment transaction response differently
      if ('type' in result && 'quantity' in result) {
        const entityId = 'id' in result && typeof result.id === 'string' ? result.id : 'unknown'
        await new AuditRepository(c.env.DB).log('CREATE', 'investment_transaction', entityId, { account_id: body.account_id, amount: body.amount })
        return c.json({ id: crypto.randomUUID(), ...result }, 201)
      }

      await new AuditRepository(c.env.DB).log('CREATE', 'transaction', result.id, { account_id: body.account_id, amount: body.amount })
      return c.json(TransactionMapper.toResponseDto(result), 201)
    } catch (error: any) {
      console.error('Transaction creation error:', error)
      
      if (error.message.includes('rate-limiting')) {
        return c.json({ 
          error: error.message,
          details: 'Rate limited by Yahoo Finance API'
        }, 429)
      }
      
      if (error.message.includes('not found')) {
        return c.json({ error: error.message }, 404)
      }
      
      return c.json({ 
        error: error.message || 'Failed to create transaction', 
        details: error.toString() 
      }, 500)
    }
  }

  async update(c: Context<{ Bindings: Bindings }>) {
    try {
      const id = c.req.param('id')
      const body = await c.req.json<UpdateTransactionDto>()
      const transaction = await this.transactionService.updateTransaction(id, body)
      await new AuditRepository(c.env.DB).log('UPDATE', 'transaction', id, { amount: body.amount, category_id: body.category_id })
      return c.json(TransactionMapper.toResponseDto(transaction))
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 500
      return c.json({ error: error.message }, status)
    }
  }

  async delete(c: Context<{ Bindings: Bindings }>) {
    const id = c.req.param('id')
    await this.transactionService.deleteTransaction(id)
    await new AuditRepository(c.env.DB).log('DELETE', 'transaction', id)
    return c.json({ success: true })
  }

  async getPaginated(c: Context) {
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sortBy = c.req.query('sortBy') || 'date'
    const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc'

    const params: PaginationParams = { page, limit, sortBy, sortOrder }
    const result = await this.transactionService.getTransactionsPaginated(params)
    
    return c.json({
      data: result.data.map(TransactionMapper.toResponseDto),
      meta: result.meta
    })
  }

  async getByDateRange(c: Context) {
    const startDate = c.req.query('startDate')
    const endDate = c.req.query('endDate')
    const accountId = c.req.query('account_id')
    const categoryId = c.req.query('category_id')

    if (!startDate || !endDate) {
      return c.json({ error: 'startDate and endDate are required' }, 400)
    }

    const transactions = await this.transactionService.getTransactionsByDateRange(
      startDate,
      endDate,
      accountId,
      categoryId
    )

    return c.json(transactions.map(TransactionMapper.toResponseDto))
  }

  async getFromDate(c: Context) {
    const startDate = c.req.query('startDate')
    const accountId = c.req.query('account_id')
    const categoryId = c.req.query('category_id')

    if (!startDate) {
      return c.json({ error: 'startDate is required' }, 400)
    }

    const transactions = await this.transactionService.getTransactionsFromDate(
      startDate,
      accountId,
      categoryId
    )

    return c.json(transactions.map(TransactionMapper.toResponseDto))
  }
}
