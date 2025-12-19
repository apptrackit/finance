import { Context } from 'hono'
import { TransactionService } from '../services/transaction.service'
import { TransactionMapper } from '../mappers/transaction.mapper'
import { CreateTransactionDto, UpdateTransactionDto } from '../dtos/transaction.dto'

export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  async getAll(c: Context) {
    const transactions = await this.transactionService.getAllTransactions()
    return c.json(transactions.map(TransactionMapper.toResponseDto))
  }

  async create(c: Context) {
    try {
      const body = await c.req.json<CreateTransactionDto>()
      const result = await this.transactionService.createTransaction(body)
      
      // Handle investment transaction response differently
      if ('type' in result && 'quantity' in result) {
        return c.json({ id: crypto.randomUUID(), ...result }, 201)
      }
      
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

  async update(c: Context) {
    try {
      const id = c.req.param('id')
      const body = await c.req.json<UpdateTransactionDto>()
      const transaction = await this.transactionService.updateTransaction(id, body)
      return c.json(TransactionMapper.toResponseDto(transaction))
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 500
      return c.json({ error: error.message }, status)
    }
  }

  async delete(c: Context) {
    const id = c.req.param('id')
    await this.transactionService.deleteTransaction(id)
    return c.json({ success: true })
  }
}
