import { Account } from '../models/Account'
import { AccountRepository } from '../repositories/account.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { CreateAccountDto, UpdateAccountDto } from '../dtos/account.dto'

export class AccountService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository
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
    const currency = dto.currency?.trim() || 'HUF'

    const account: Account = {
      id,
      name: dto.name,
      type: dto.type,
      balance: dto.balance,
      currency: currency.toUpperCase(),
      symbol: dto.symbol,
      asset_type: dto.asset_type,
      exclude_from_net_worth: dto.exclude_from_net_worth,
      exclude_from_cash_balance: dto.exclude_from_cash_balance,
      updated_at: now
    }

    await this.accountRepo.create(account)
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
    delete (updates as any).splitTransactions

    const currency = dto.currency?.trim()
    if (currency) {
      updates.currency = currency.toUpperCase()
    } else {
      delete (updates as any).currency
    }

    await this.accountRepo.update(id, updates)

    // If adjustWithTransaction is true and balance changed, create transactions
    if (dto.adjustWithTransaction && oldAccount && dto.balance !== undefined) {
      const oldBalance = oldAccount.balance
      const newBalance = dto.balance
      const difference = newBalance - oldBalance

      // Only create transactions if there's actually a difference
      if (difference !== 0) {
        // Check if we have split transactions
        if (dto.splitTransactions && dto.splitTransactions.length > 0) {
          // Create multiple transactions based on the split
          for (const split of dto.splitTransactions) {
            await this.transactionRepo.create({
              id: split.id,
              account_id: id,
              category_id: split.category_id,
              amount: split.amount,
              description: split.description,
              date: split.date,
              is_recurring: false
            })
          }
        } else {
          // Create a single adjustment transaction (original behavior)
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
