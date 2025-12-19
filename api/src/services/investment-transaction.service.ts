import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { InvestmentTransactionRepository } from '../repositories/investment-transaction.repository'
import { AccountRepository } from '../repositories/account.repository'
import { CreateInvestmentTransactionDto } from '../dtos/investment-transaction.dto'

export class InvestmentTransactionService {
  constructor(
    private investmentTransactionRepo: InvestmentTransactionRepository,
    private accountRepo: AccountRepository
  ) {}

  async getInvestmentTransactions(accountId?: string): Promise<InvestmentTransaction[]> {
    if (accountId) {
      return await this.investmentTransactionRepo.findByAccountId(accountId)
    }
    return await this.investmentTransactionRepo.findAll()
  }

  async createInvestmentTransaction(dto: CreateInvestmentTransactionDto): Promise<InvestmentTransaction> {
    // Validate account exists and is investment type
    const account = await this.accountRepo.findById(dto.account_id)

    if (!account) {
      throw new Error('Account not found')
    }

    if (account.type !== 'investment') {
      throw new Error('Account must be of type investment')
    }

    // Validate required fields
    if (!dto.type || !dto.quantity || !dto.price || !dto.date) {
      throw new Error('Missing required fields: type, quantity, price, date')
    }

    if (dto.type !== 'buy' && dto.type !== 'sell') {
      throw new Error('Type must be either "buy" or "sell"')
    }

    if (dto.quantity <= 0 || dto.price <= 0) {
      throw new Error('Quantity and price must be positive numbers')
    }

    const transaction: InvestmentTransaction = {
      id: crypto.randomUUID(),
      account_id: dto.account_id,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      total_amount: dto.total_amount,
      date: dto.date,
      notes: dto.notes,
      created_at: Date.now()
    }

    await this.investmentTransactionRepo.create(transaction)
    return transaction
  }

  async deleteInvestmentTransaction(id: string): Promise<void> {
    // Get investment transaction to revert balance
    const invTx = await this.investmentTransactionRepo.findById(id)
    
    if (invTx) {
      // Revert balance by subtracting the quantity that was added
      const account = await this.accountRepo.findById(invTx.account_id)
      if (account) {
        // For 'buy' transactions, quantity was added, so we subtract it
        // For 'sell' transactions, quantity was subtracted (negative), so subtracting it adds it back
        const quantityChange = invTx.type === 'buy' ? invTx.quantity : -invTx.quantity
        await this.accountRepo.updateBalance(
          invTx.account_id,
          account.balance - quantityChange,
          Date.now()
        )
      }
    }

    await this.investmentTransactionRepo.delete(id)
  }
}
