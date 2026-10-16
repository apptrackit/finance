import { AppError } from '../errors/codes'
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

    if (fromAccount.archived_at != null || toAccount.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore archived accounts before transferring.', 409)

    if (fromAccount.is_locked) {
      throw new Error(`Account "${fromAccount.name}" is locked`)
    }

    if (toAccount.is_locked) {
      throw new Error(`Account "${toAccount.name}" is locked`)
    }
    if (fromAccount.type === 'investment') {
      throw AppError.validation('Transfers from investment holdings require a linked sale workflow, which this endpoint does not support yet.')
    }

    if (toAccount.type === 'investment') {
      const now = Date.now()
      const outgoingId = crypto.randomUUID()
      const incomingId = crypto.randomUUID()
      const price = dto.price ?? 0
      if (!Number.isFinite(dto.amount_to * price)) throw AppError.validation('Investment total must be finite')
      const details = `${dto.amount_to.toFixed(8)} shares${price > 0 ? ` @ ${toAccount.quote_currency || 'USD'} ${price.toFixed(2)}/share` : ''}`
      const note = dto.description ? ` - ${dto.description}` : ''
      const created = await this.investmentTransactionRepo.transfers.create({
        id: outgoingId, account_id: fromAccount.id, amount: -dto.amount_from,
        description: `Transfer to ${toAccount.name} (${details})${note}`, date: dto.date,
        linked_transaction_id: incomingId,
      }, {
        id: incomingId, account_id: toAccount.id, type: 'buy', quantity: dto.amount_to,
        price, total_amount: dto.amount_to * price, date: dto.date,
        notes: `Transfer from ${fromAccount.name} (${details})${note}`,
        linked_transaction_id: outgoingId, created_at: now,
      }, now)
      if (!created) throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Transfer accounts changed; refresh and try again.', 409)
      return {
        id: crypto.randomUUID(), outgoing_transaction_id: outgoingId, incoming_transaction_id: incomingId,
        amount_from: dto.amount_from, amount_to: dto.amount_to, exchange_rate: dto.amount_to / dto.amount_from,
        from_account_id: fromAccount.id, to_account_id: toAccount.id, is_investment_transfer: true,
      }
    }

    const totalDeduction = dto.amount_from
    const now = Date.now()
    const transferId = crypto.randomUUID()
    const outgoingId = crypto.randomUUID()
    const incomingId = crypto.randomUUID()

    // Build descriptions that distinguish a share price from the FX rate used
    // to convert the cash amount into the share quantity.
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

    await this.transactionRepo.create({
      id: incomingId, account_id: dto.to_account_id, amount: dto.amount_to,
      description: incomingDesc, date: dto.date, linked_transaction_id: outgoingId,
    })
    await this.accountRepo.updateBalance(dto.to_account_id, toAccount.balance + dto.amount_to, now)

    return {
      id: transferId,
      outgoing_transaction_id: outgoingId,
      incoming_transaction_id: incomingId,
      amount_from: dto.amount_from,
      amount_to: dto.amount_to,
      exchange_rate: dto.amount_to / dto.amount_from,
      from_account_id: dto.from_account_id,
      to_account_id: dto.to_account_id,
      is_investment_transfer: false
    }
  }
}
