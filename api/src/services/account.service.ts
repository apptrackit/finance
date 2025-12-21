import { D1Database } from '@cloudflare/workers-types'
import { Account } from '../models/Account'
import { AccountRepository } from '../repositories/account.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { CreateAccountDto, UpdateAccountDto } from '../dtos/account.dto'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'

export class AccountService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository,
    private db: D1Database
  ) {}

  async getAllAccounts(): Promise<Account[]> {
    return await this.accountRepo.findAll()
  }

  async getAccountById(id: string): Promise<Account | null> {
    return await this.accountRepo.findById(id)
  }

  async createAccount(dto: CreateAccountDto): Promise<Account> {
    const id = crypto.randomUUID()
    const now = Date.now()

    const account: Account = {
      id,
      name: dto.name,
      type: dto.type,
      balance: dto.balance,
      currency: dto.currency || 'HUF',
      symbol: dto.symbol,
      asset_type: dto.asset_type,
      updated_at: now
    }

    await this.accountRepo.create(account)
    
    // If it's an investment account with a symbol, try to fetch and cache the price
    if (account.type === 'investment' && account.symbol && account.asset_type !== 'manual') {
      try {
        const today = new Date().toISOString().split('T')[0]
        const price = await fetchPriceFromYahoo(account.symbol, today, this.db)
        if (price > 0) {
          console.log(`✓ Cached initial price for ${account.symbol}: $${price}`)
        }
      } catch (error) {
        // Don't fail account creation if price fetch fails - just log it
        console.warn(`Could not fetch initial price for ${account.symbol}:`, error)
      }
    }
    
    return account
  }

  async updateAccount(id: string, dto: UpdateAccountDto): Promise<Account> {
    const now = Date.now()

    // Get the current account data if we're potentially adjusting balance with a transaction
    let oldAccount: Account | null = null
    if (dto.balance !== undefined && dto.adjustWithTransaction) {
      oldAccount = await this.accountRepo.findById(id)
    }

    // Update account details
    const updates: Partial<Account> = {
      ...dto,
      updated_at: now
    }
    delete (updates as any).adjustWithTransaction

    await this.accountRepo.update(id, updates)

    // If adjustWithTransaction is true and balance changed, create a transaction for the difference
    if (dto.adjustWithTransaction && oldAccount && dto.balance !== undefined) {
      const oldBalance = oldAccount.balance
      const newBalance = dto.balance
      const difference = newBalance - oldBalance

      // Only create a transaction if there's actually a difference
      if (difference !== 0) {
        const transactionId = crypto.randomUUID()
        const description = difference > 0
          ? `Balance adjustment: +${Math.abs(difference)}`
          : `Balance adjustment: -${Math.abs(difference)}`

        await this.transactionRepo.create({
          id: transactionId,
          account_id: id,
          amount: difference,
          description,
          date: new Date().toISOString().split('T')[0],
          is_recurring: false
        })
      }
    }

    // Return updated account
    const updatedAccount = await this.accountRepo.findById(id)
    return updatedAccount!
  }

  async deleteAccount(id: string): Promise<void> {
    // Delete associated transactions first
    await this.transactionRepo.deleteByAccountId(id)
    await this.accountRepo.delete(id)
  }
}
