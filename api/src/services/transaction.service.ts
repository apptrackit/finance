import { Transaction } from '../models/Transaction'
import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { TransactionRepository } from '../repositories/transaction.repository'
import { AccountRepository } from '../repositories/account.repository'
import { InvestmentTransactionRepository } from '../repositories/investment-transaction.repository'
import { CreateTransactionDto, UpdateTransactionDto } from '../dtos/transaction.dto'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'
import { PaginatedResponse, PaginationHelper, PaginationParams, DateFilterParams } from '../models/Pagination'

export class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private accountRepo: AccountRepository,
    private investmentTransactionRepo: InvestmentTransactionRepository
  ) {}

  async getAllTransactions(): Promise<Transaction[]> {
    return await this.transactionRepo.findAll()
  }

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction | { type: string; quantity: number; price: number; total_amount: number }> {
    const id = crypto.randomUUID()

    // Get account to check if it's an investment account
    const account = await this.accountRepo.findById(dto.account_id)
    
    if (!account) {
      throw new Error('Account not found')
    }

    // For investment accounts: redirect to investment_transactions table
    if (account.type === 'investment') {
      const quantity = dto.amount
      const isIncome = quantity > 0
      const absQuantity = Math.abs(quantity)
      let pricePerUnit = dto.price || 0
      
      // Only fetch price if not provided by frontend
      if (!pricePerUnit && account.asset_type !== 'manual' && account.symbol) {
        try {
          pricePerUnit = await fetchPriceFromYahoo(account.symbol, dto.date)
          
          if (!pricePerUnit || pricePerUnit === 0) {
            throw new Error(`Could not fetch price for ${account.symbol} on ${dto.date}. Please try again or contact support.`)
          }
        } catch (error: any) {
          if (error.message === 'RATE_LIMITED') {
            throw new Error('Yahoo Finance is rate-limiting. Please try again in a few seconds, or enter the price manually.')
          }
          throw new Error(`Failed to fetch price for ${account.symbol}. Error: ${error.message}`)
        }
      }
      
      const totalAmount = absQuantity * pricePerUnit
      
      // Create investment_transaction record
      const investmentTransaction: InvestmentTransaction = {
        id,
        account_id: dto.account_id,
        type: isIncome ? 'buy' : 'sell',
        quantity: absQuantity,
        price: pricePerUnit,
        total_amount: totalAmount,
        date: dto.date,
        notes: dto.description,
        created_at: Date.now()
      }

      await this.investmentTransactionRepo.create(investmentTransaction)
      
      // Update account balance with quantity
      const newBalance = account.balance + quantity
      await this.accountRepo.updateBalance(dto.account_id, newBalance, Date.now())
      
      return { type: isIncome ? 'buy' : 'sell', quantity: absQuantity, price: pricePerUnit, total_amount: totalAmount }
    }

    // For non-investment accounts: use regular transactions table
    const transaction: Transaction = {
      id,
      account_id: dto.account_id,
      category_id: dto.category_id,
      amount: dto.amount,
      description: dto.description,
      date: dto.date,
      linked_transaction_id: dto.linked_transaction_id,
      exclude_from_estimate: dto.exclude_from_estimate
    }

    await this.transactionRepo.create(transaction)

    // Update account balance
    const newBalance = account.balance + dto.amount
    await this.accountRepo.updateBalance(dto.account_id, newBalance, Date.now())

    return transaction
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    // Get old transaction to adjust balance
    const oldTx = await this.transactionRepo.findById(id)

    if (!oldTx) {
      throw new Error('Transaction not found')
    }

    // Revert old balance
    const oldAccount = await this.accountRepo.findById(oldTx.account_id)
    if (oldAccount) {
      await this.accountRepo.updateBalance(
        oldTx.account_id,
        oldAccount.balance - oldTx.amount,
        Date.now()
      )
    }

    // Update transaction
    const newAccountId = dto.account_id || oldTx.account_id
    const newAmount = dto.amount ?? oldTx.amount

    await this.transactionRepo.update(id, {
      account_id: newAccountId,
      category_id: dto.category_id !== undefined ? dto.category_id : oldTx.category_id,
      amount: newAmount,
      description: dto.description !== undefined ? dto.description : oldTx.description,
      date: dto.date || oldTx.date,
      exclude_from_estimate: dto.exclude_from_estimate !== undefined ? dto.exclude_from_estimate : oldTx.exclude_from_estimate
    })

    // Apply new balance
    const newAccount = await this.accountRepo.findById(newAccountId)
    if (newAccount) {
      await this.accountRepo.updateBalance(
        newAccountId,
        newAccount.balance + newAmount,
        Date.now()
      )
    }

    const updated = await this.transactionRepo.findById(id)
    return updated!
  }

  async deleteTransaction(id: string): Promise<void> {
    // Get transaction to revert balance
    const tx = await this.transactionRepo.findById(id)

    if (tx) {
      // Revert balance for the main transaction
      const account = await this.accountRepo.findById(tx.account_id)
      if (account) {
        await this.accountRepo.updateBalance(
          tx.account_id,
          account.balance - tx.amount,
          Date.now()
        )
      }

      // If this is a transfer (has linked_transaction_id), delete the linked transaction too
      if (tx.linked_transaction_id) {
        const linkedTx = await this.transactionRepo.findById(tx.linked_transaction_id)
        if (linkedTx) {
          // Revert balance for the linked account
          const linkedAccount = await this.accountRepo.findById(linkedTx.account_id)
          if (linkedAccount) {
            await this.accountRepo.updateBalance(
              linkedTx.account_id,
              linkedAccount.balance - linkedTx.amount,
              Date.now()
            )
          }
          // Delete the linked transaction
          await this.transactionRepo.delete(tx.linked_transaction_id)
        }
      }

      // Delete the main transaction
      await this.transactionRepo.delete(id)
    }
  }

  async cloneRecurringTransactions(): Promise<void> {
    const recurringTransactions = await this.transactionRepo.findRecurring()

    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7) // YYYY-MM

    for (const tx of recurringTransactions) {
      // Check if we already have a transaction for this account, amount, description in the current month
      const existing = await this.transactionRepo.findByAccountAndDatePattern(
        tx.account_id,
        tx.amount,
        tx.description || '',
        `${currentMonth}%`
      )

      if (!existing) {
        const newId = crypto.randomUUID()
        // Keep the same day of month
        const day = parseInt(tx.date.split('-')[2] || '1')
        const newDateObj = new Date(now.getFullYear(), now.getMonth(), day)
        const newDate = newDateObj.toISOString().split('T')[0]

        const newTransaction: Transaction = {
          id: newId,
          account_id: tx.account_id,
          category_id: tx.category_id,
          amount: tx.amount,
          description: tx.description,
          date: newDate,
          is_recurring: true
        }

        await this.transactionRepo.create(newTransaction)
        console.log(`Cloned transaction ${tx.id} to ${newId}`)
      }
    }
  }

  async getTransactionsPaginated(params: PaginationParams): Promise<PaginatedResponse<Transaction>> {
    const { page, limit } = PaginationHelper.validatePaginationParams(params)
    const offset = PaginationHelper.calculateOffset(page, limit)
    
    const sortBy = params.sortBy || 'date'
    const sortOrder = params.sortOrder || 'desc'

    const [transactions, total] = await Promise.all([
      this.transactionRepo.findPaginated(offset, limit, sortBy, sortOrder),
      this.transactionRepo.count()
    ])

    return {
      data: transactions,
      meta: PaginationHelper.createMeta(total, page, limit)
    }
  }

  async getTransactionsByDateRange(
    startDate: string, 
    endDate: string, 
    accountId?: string, 
    categoryId?: string
  ): Promise<Transaction[]> {
    return await this.transactionRepo.findByDateRange(startDate, endDate, accountId, categoryId)
  }

  async getTransactionsFromDate(
    startDate: string,
    accountId?: string,
    categoryId?: string
  ): Promise<Transaction[]> {
    return await this.transactionRepo.findFromDate(startDate, accountId, categoryId)
  }
}
