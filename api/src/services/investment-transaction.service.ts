import { InvestmentTradeService } from './investment-trade.service'
import { AppError } from '../errors/codes'
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
    const account = await this.accountRepo.findById(dto.account_id)
    if (account?.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore this account first.',409)
    if (account?.is_locked) throw new AppError('ACCOUNT_LOCKED', 'Unlock this account first.',409)
    throw AppError.validation('Standalone investment creation is read-only. Use /investment-trades with a linked cash settlement.')
  }
  async deleteInvestmentTransaction(id: string, today?: string): Promise<void> {
    await new InvestmentTradeService(this.investmentTransactionRepo.trades).remove(id,today)
  }
}
