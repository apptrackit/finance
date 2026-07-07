import { Transaction, TransactionStatus } from '../models/Transaction'
import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { Account } from '../models/Account'
import { TransactionRepository } from '../repositories/transaction.repository'
import { AccountRepository } from '../repositories/account.repository'
import { InvestmentTransactionRepository } from '../repositories/investment-transaction.repository'
import { CreateTransactionDto, UpdateTransactionDto } from '../dtos/transaction.dto'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'
import { PaginatedResponse, PaginationHelper, PaginationParams } from '../models/Pagination'

export class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private accountRepo: AccountRepository,
    private investmentTransactionRepo: InvestmentTransactionRepository
  ) {}

  private assertAccountUnlocked(account: Account): void {
    if (account.is_locked) {
      throw new Error(`Account "${account.name}" is locked`)
    }
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private isPosted(transaction: Transaction): boolean {
    return (transaction.status || 'posted') === 'posted'
  }

  private resolveCreateStatus(dto: CreateTransactionDto): TransactionStatus {
    if (dto.status === 'pending' || dto.date > this.todayString()) {
      return 'pending'
    }
    return 'posted'
  }

  private resolveUpdateStatus(oldTx: Transaction, dto: UpdateTransactionDto): TransactionStatus {
    if ((oldTx.status || 'posted') === 'pending') {
      return 'pending'
    }

    const nextDate = dto.date || oldTx.date
    return nextDate > this.todayString() ? 'pending' : 'posted'
  }

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

    this.assertAccountUnlocked(account)

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
        notes: dto.description ?? undefined,
        created_at: Date.now()
      }

      await this.investmentTransactionRepo.create(investmentTransaction)
      
      // Update account balance with quantity
      const newBalance = account.balance + quantity
      await this.accountRepo.updateBalance(dto.account_id, newBalance, Date.now())
      
      return { type: isIncome ? 'buy' : 'sell', quantity: absQuantity, price: pricePerUnit, total_amount: totalAmount }
    }

    // For non-investment accounts: use regular transactions table
    const now = Date.now()
    const status = this.resolveCreateStatus(dto)
    const transaction: Transaction = {
      id,
      account_id: dto.account_id,
      category_id: dto.category_id,
      amount: dto.amount,
      description: dto.description,
      date: dto.date,
      linked_transaction_id: dto.linked_transaction_id,
      exclude_from_estimate: dto.exclude_from_estimate,
      status,
      confirmed_at: status === 'posted' ? now : null,
      cancelled_at: null,
      created_at: now,
      updated_at: now
    }

    await this.transactionRepo.create(transaction)

    if (status === 'posted') {
      const newBalance = account.balance + dto.amount
      await this.accountRepo.updateBalance(dto.account_id, newBalance, now)
    }

    return transaction
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    // Get old transaction to adjust balance
    const oldTx = await this.transactionRepo.findById(id)

    if (!oldTx) {
      throw new Error('Transaction not found')
    }

    if ((oldTx.status || 'posted') === 'cancelled') {
      throw new Error('Cancelled transaction cannot be edited')
    }

    if (oldTx.linked_transaction_id) {
      const linkedTx = await this.transactionRepo.findById(oldTx.linked_transaction_id)
      if (linkedTx) {
        return await this.updateTransferPair(oldTx, linkedTx, dto)
      }
    }

    const oldAccount = await this.accountRepo.findById(oldTx.account_id)
    if (!oldAccount) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(oldAccount)

    const newAccountId = dto.account_id || oldTx.account_id
    const newAmount = dto.amount ?? oldTx.amount
    const newStatus = this.resolveUpdateStatus(oldTx, dto)
    const now = Date.now()
    if (newAccountId !== oldTx.account_id) {
      const targetAccount = await this.accountRepo.findById(newAccountId)
      if (!targetAccount) {
        throw new Error('Account not found')
      }
      this.assertAccountUnlocked(targetAccount)
    }

    if (this.isPosted(oldTx)) {
      await this.accountRepo.updateBalance(
        oldTx.account_id,
        oldAccount.balance - oldTx.amount,
        now
      )
    }

    // Update transaction
    await this.transactionRepo.update(id, {
      account_id: newAccountId,
      category_id: dto.category_id !== undefined ? dto.category_id : oldTx.category_id,
      amount: newAmount,
      description: dto.description !== undefined ? dto.description : oldTx.description,
      date: dto.date || oldTx.date,
      exclude_from_estimate: dto.exclude_from_estimate !== undefined ? dto.exclude_from_estimate : oldTx.exclude_from_estimate,
      status: newStatus,
      confirmed_at: newStatus === 'posted' ? (oldTx.confirmed_at ?? now) : null,
      cancelled_at: null,
      updated_at: now
    })

    if (newStatus === 'posted') {
      const newAccount = await this.accountRepo.findById(newAccountId)
      if (!newAccount) {
        throw new Error('Account not found')
      }
      await this.accountRepo.updateBalance(
        newAccountId,
        newAccount.balance + newAmount,
        now
      )
    }

    const updated = await this.transactionRepo.findById(id)
    return updated!
  }

  private async updateTransferPair(tx: Transaction, linkedTx: Transaction, dto: UpdateTransactionDto): Promise<Transaction> {
    const outgoing = tx.amount < 0 ? tx : linkedTx
    const incoming = tx.amount < 0 ? linkedTx : tx
    const requestedId = tx.id

    const fromAccountId = dto.account_id || outgoing.account_id
    const toAccountId = dto.to_account_id || incoming.account_id
    const amountFrom = Math.abs(dto.amount ?? outgoing.amount)
    const amountTo = dto.amount_to ?? Math.abs(incoming.amount)
    const date = dto.date || outgoing.date
    const note = dto.description !== undefined ? dto.description : undefined
    const now = Date.now()

    if (fromAccountId === toAccountId) {
      throw new Error('Cannot transfer to same account')
    }

    if (amountFrom <= 0 || amountTo <= 0) {
      throw new Error('Transfer amounts must be positive')
    }

    const accountIds = new Set([outgoing.account_id, incoming.account_id, fromAccountId, toAccountId])
    const accounts = new Map<string, Account>()

    for (const accountId of accountIds) {
      const account = await this.accountRepo.findById(accountId)
      if (!account) {
        throw new Error('Account not found')
      }
      this.assertAccountUnlocked(account)
      accounts.set(accountId, account)
    }

    const balanceDeltas = new Map<string, number>()
    const addDelta = (accountId: string, delta: number) => {
      balanceDeltas.set(accountId, (balanceDeltas.get(accountId) || 0) + delta)
    }

    addDelta(outgoing.account_id, -outgoing.amount)
    addDelta(incoming.account_id, -incoming.amount)
    addDelta(fromAccountId, -amountFrom)
    addDelta(toAccountId, amountTo)

    for (const [accountId, delta] of balanceDeltas) {
      if (delta === 0) continue
      const account = accounts.get(accountId)!
      await this.accountRepo.updateBalance(accountId, account.balance + delta, now)
    }

    let outgoingDescription = outgoing.description
    let incomingDescription = incoming.description

    if (note !== undefined) {
      const fromAccount = accounts.get(fromAccountId)!
      const toAccount = accounts.get(toAccountId)!
      const effectiveRate = amountTo / amountFrom

      outgoingDescription = `Transfer to ${toAccount.name}`
      incomingDescription = `Transfer from ${fromAccount.name}`

      if (fromAccount.currency !== toAccount.currency) {
        outgoingDescription += ` (${amountTo.toFixed(2)} ${toAccount.currency} @ ${effectiveRate.toFixed(4)})`
        incomingDescription += ` (${amountFrom.toFixed(2)} ${fromAccount.currency} @ ${effectiveRate.toFixed(4)})`
      }

      if (note) {
        outgoingDescription += ` - ${note}`
        incomingDescription += ` - ${note}`
      }
    }

    await this.transactionRepo.update(outgoing.id, {
      account_id: fromAccountId,
      category_id: null,
      amount: -amountFrom,
      description: outgoingDescription,
      date,
      exclude_from_estimate: false
    })

    await this.transactionRepo.update(incoming.id, {
      account_id: toAccountId,
      category_id: null,
      amount: amountTo,
      description: incomingDescription,
      date,
      exclude_from_estimate: false
    })

    const updated = await this.transactionRepo.findById(requestedId)
    return updated!
  }

  async deleteTransaction(id: string): Promise<void> {
    // Get transaction to revert balance
    const tx = await this.transactionRepo.findById(id)

    if (tx) {
      const account = await this.accountRepo.findById(tx.account_id)
      if (account) {
        this.assertAccountUnlocked(account)
      }

      let linkedTx: Transaction | null = null
      let linkedAccount: Account | null = null

      if (tx.linked_transaction_id) {
        linkedTx = await this.transactionRepo.findById(tx.linked_transaction_id)
        if (linkedTx) {
          linkedAccount = await this.accountRepo.findById(linkedTx.account_id)
          if (linkedAccount) {
            this.assertAccountUnlocked(linkedAccount)
          }
        }
      }

      // Revert balance for the main transaction
      if (account && this.isPosted(tx)) {
        await this.accountRepo.updateBalance(
          tx.account_id,
          account.balance - tx.amount,
          Date.now()
        )
      }

      // If this is a transfer (has linked_transaction_id), delete the linked transaction too
      if (linkedTx) {
        if (linkedAccount && this.isPosted(linkedTx)) {
          await this.accountRepo.updateBalance(
            linkedTx.account_id,
            linkedAccount.balance - linkedTx.amount,
            Date.now()
          )
        }
        await this.transactionRepo.delete(linkedTx.id)
      }

      // Delete the main transaction
      await this.transactionRepo.delete(id)
    }
  }

  async getUpcomingTransactions(): Promise<Transaction[]> {
    return await this.transactionRepo.findUpcoming()
  }

  async confirmTransaction(id: string): Promise<Transaction> {
    const tx = await this.transactionRepo.findById(id)

    if (!tx) {
      throw new Error('Transaction not found')
    }

    if (tx.linked_transaction_id) {
      throw new Error('Linked transfers cannot be confirmed as upcoming transactions')
    }

    if ((tx.status || 'posted') !== 'pending') {
      throw new Error('Transaction is not pending confirmation')
    }

    const account = await this.accountRepo.findById(tx.account_id)
    if (!account) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(account)

    const now = Date.now()
    await this.accountRepo.updateBalance(tx.account_id, account.balance + tx.amount, now)
    await this.transactionRepo.update(id, {
      status: 'posted',
      confirmed_at: now,
      cancelled_at: null,
      updated_at: now
    })

    const updated = await this.transactionRepo.findById(id)
    return updated!
  }

  async declineTransaction(id: string): Promise<Transaction> {
    const tx = await this.transactionRepo.findById(id)

    if (!tx) {
      throw new Error('Transaction not found')
    }

    if ((tx.status || 'posted') !== 'pending') {
      throw new Error('Transaction is not pending confirmation')
    }

    const account = await this.accountRepo.findById(tx.account_id)
    if (!account) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(account)

    const now = Date.now()
    await this.transactionRepo.update(id, {
      status: 'cancelled',
      cancelled_at: now,
      updated_at: now
    })

    const updated = await this.transactionRepo.findById(id)
    return updated!
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
