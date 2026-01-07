import { AccountRepository } from '../repositories/account.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { InvestmentTransactionRepository } from '../repositories/investment-transaction.repository'
import { CreateTransferDto, TransferResponseDto } from '../dtos/transfer.dto'
import { getExchangeRates } from '../utils/exchange-rate.util'

export class TransferService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository,
    private investmentTransactionRepo: InvestmentTransactionRepository
  ) {}

  async getExchangeRate(from: string, to: string): Promise<{ rate: number; from: string; to: string }> {
    if (from === to) {
      return { rate: 1, from, to }
    }

    const rates = await getExchangeRates(from)
    const rate = rates[to] || null

    if (!rate) {
      throw new Error('Exchange rate not available')
    }

    return { rate, from, to }
  }

  async createTransfer(dto: CreateTransferDto): Promise<TransferResponseDto> {
    if (dto.from_account_id === dto.to_account_id) {
      throw new Error('Cannot transfer to same account')
    }

    if (dto.amount_from <= 0 || dto.amount_to <= 0) {
      throw new Error('Amounts must be positive')
    }

    // Get both accounts
    const fromAccount = await this.accountRepo.findById(dto.from_account_id)
    const toAccount = await this.accountRepo.findById(dto.to_account_id)

    if (!fromAccount || !toAccount) {
      throw new Error('Account not found')
    }

    const totalDeduction = dto.amount_from
    const now = Date.now()
    const transferId = crypto.randomUUID()
    const outgoingId = crypto.randomUUID()
    const incomingId = crypto.randomUUID()

    // Build description with exchange rate info if currencies differ
    let outgoingDesc = `Transfer to ${toAccount.name}`
    let incomingDesc = `Transfer from ${fromAccount.name}`

    if (fromAccount.currency !== toAccount.currency) {
      const effectiveRate = dto.amount_to / dto.amount_from
      outgoingDesc += ` (${dto.amount_to.toFixed(2)} ${toAccount.currency} @ ${effectiveRate.toFixed(4)})`
      incomingDesc += ` (${dto.amount_from.toFixed(2)} ${fromAccount.currency} @ ${effectiveRate.toFixed(4)})`
    }

    if (dto.description) {
      outgoingDesc += ` - ${dto.description}`
      incomingDesc += ` - ${dto.description}`
    }

    // Create outgoing transaction (always in regular transactions - cash out)
    await this.transactionRepo.create({
      id: outgoingId,
      account_id: dto.from_account_id,
      amount: -totalDeduction,
      description: outgoingDesc,
      date: dto.date,
      linked_transaction_id: incomingId
    })

    // Update FROM account balance (always cash account)
    await this.accountRepo.updateBalance(
      dto.from_account_id,
      fromAccount.balance - totalDeduction,
      now
    )

    // Handle incoming transaction based on TO account type
    if (toAccount.type === 'investment') {
      // TO account is investment: save to investment_transactions
      const quantity = dto.amount_to // amount_to is the number of shares
      const pricePerUnit = dto.price || 0
      const totalAmount = quantity * pricePerUnit
      
      await this.investmentTransactionRepo.create({
        id: incomingId,
        account_id: dto.to_account_id,
        type: 'buy',
        quantity,
        price: pricePerUnit,
        total_amount: totalAmount,
        date: dto.date,
        notes: incomingDesc,
        created_at: now
      })
      
      // Update investment account balance with shares
      await this.accountRepo.updateBalance(
        dto.to_account_id,
        toAccount.balance + quantity,
        now
      )
    } else {
      // TO account is regular cash account: save to transactions
      await this.transactionRepo.create({
        id: incomingId,
        account_id: dto.to_account_id,
        amount: dto.amount_to,
        description: incomingDesc,
        date: dto.date,

        linked_transaction_id: outgoingId
      })
      
      // Update cash account balance
      await this.accountRepo.updateBalance(
        dto.to_account_id,
        toAccount.balance + dto.amount_to,
        now
      )
    }

    return {
      id: transferId,
      outgoing_transaction_id: outgoingId,
      incoming_transaction_id: incomingId,
      amount_from: dto.amount_from,
      amount_to: dto.amount_to,
      exchange_rate: dto.amount_to / dto.amount_from,
      from_account_id: dto.from_account_id,
      to_account_id: dto.to_account_id,
      is_investment_transfer: toAccount.type === 'investment'
    }
  }
}
