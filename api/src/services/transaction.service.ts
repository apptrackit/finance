import { AppError } from '../errors/codes'
import { Transaction, TransactionStatus } from '../models/Transaction'
import { InvestmentTransaction } from '../models/InvestmentTransaction'
import { Account } from '../models/Account'
import { TransactionRepository } from '../repositories/transaction.repository'
import { AccountRepository } from '../repositories/account.repository'
import { InvestmentTransactionRepository } from '../repositories/investment-transaction.repository'
import { CreateTransactionDto, UpdateTransactionDto } from '../dtos/transaction.dto'
import { InvestmentTradeService } from './investment-trade.service'
import { PaginatedResponse, PaginationHelper, PaginationParams } from '../models/Pagination'

type TransactionMutationResult = Transaction & { auditRecorded?: boolean }

export class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private accountRepo: AccountRepository,
    private investmentTransactionRepo: InvestmentTransactionRepository
  ) {}

  private assertAccountUnlocked(account: Account): void {
    if (account.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore this account before making changes.', 409)
    if (account.is_locked) {
      throw new Error(`Account "${account.name}" is locked`)
    }
  }

  private assertNotSplitLine(transaction: Transaction): void {
    if (transaction.split_id) {
      throw new AppError('SPLIT_LINE_EDIT', 'This transaction is part of a split. Edit or delete the whole split instead.', 409)
    }
  }

  private todayString(today?: string): string {
    return today || new Date().toISOString().slice(0, 10)
  }

  private isPosted(transaction: Transaction): boolean {
    return (transaction.status || 'posted') === 'posted'
  }

  private resolveCreateStatus(dto: CreateTransactionDto, today?: string): TransactionStatus {
    if (dto.status === 'pending' || dto.date > this.todayString(today)) {
      return 'pending'
    }
    return 'posted'
  }

  private resolveUpdateStatus(oldTx: Transaction, dto: UpdateTransactionDto, today?: string): TransactionStatus {
    if ((oldTx.status || 'posted') === 'pending') {
      return 'pending'
    }

    const nextDate = dto.date || oldTx.date
    return nextDate > this.todayString(today) ? 'pending' : 'posted'
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return await this.transactionRepo.findAll()
  }

  async createTransaction(dto: CreateTransactionDto, today?: string): Promise<TransactionMutationResult> {
    const id = crypto.randomUUID()

    // Get account to check if it's an investment account
    const account = await this.accountRepo.findById(dto.account_id)
    
    if (!account) {
      throw new Error('Account not found')
    }

    this.assertAccountUnlocked(account)

    if (dto.linked_transaction_id) {
      if (this.resolveCreateStatus(dto, today) === 'pending') {
        throw new Error('Linked transfers cannot be pending; use the /transfers endpoint')
      }
      throw AppError.validation('Create linked transfers through the /transfers endpoint so both records are saved together')
    }

    if (account.type === 'investment') {
      throw AppError.validation('Record investment buys/sells through the linked trade flow with exact cash settlement. Legacy standalone records remain read-only.')
    }

    // For non-investment accounts: use regular transactions table
    const now = Date.now()
    const status = this.resolveCreateStatus(dto, today)

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
      pending_kind: 'upcoming',
      review_source: 'manual',
      review_batch_id: null,
      review_flags: [],
      confirmed_at: status === 'posted' ? now : null,
      cancelled_at: null,
      created_at: now,
      updated_at: now
    }

    await this.transactionRepo.cashLedger.commit({ before: [], after: [transaction], accounts: [account], now })
    return { ...transaction, auditRecorded: true }
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto, today?: string): Promise<TransactionMutationResult> {
    // Get old transaction to adjust balance
    const oldTx = await this.transactionRepo.findById(id)

    if (!oldTx) {
      throw new Error('Transaction not found')
    }

    this.assertNotSplitLine(oldTx)

    if ((oldTx.status || 'posted') === 'cancelled') {
      throw new Error('Cancelled transaction cannot be edited')
    }
    const investmentLink = await this.investmentTransactionRepo.findByCashTransactionId(id)
    if (investmentLink && investmentLink.id !== oldTx.linked_transaction_id) {
      throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Investment transfer links are inconsistent; repair the pair before editing.', 409)
    }

    if (oldTx.linked_transaction_id) {
      if (!this.isPosted(oldTx)) {
        if (oldTx.status === 'pending' && oldTx.pending_kind === 'mcp_review' && oldTx.review_source === 'chatgpt_mcp') {
          const linkedReview = await this.transactionRepo.findById(oldTx.linked_transaction_id)
          if (!linkedReview) throw new Error('Transfer review pair is invalid')
          return this.updatePendingTransferReview(oldTx, linkedReview, dto)
        }
        throw new Error('Linked transfers cannot be pending')
      }

      const linkedTx = await this.transactionRepo.findById(oldTx.linked_transaction_id)
      const linkedInvestmentTx = await this.investmentTransactionRepo.findById(oldTx.linked_transaction_id)
      if (linkedTx && linkedInvestmentTx) {
        throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Linked transaction ID is ambiguous; repair the transfer before editing.', 409)
      }
      if (linkedTx) {
        return await this.updateTransferPair(oldTx, linkedTx, dto)
      }

      if (linkedInvestmentTx) {
        return await this.updateInvestmentTransfer(oldTx, linkedInvestmentTx, dto, today)
      }
      throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Linked transaction is missing; refresh and repair the transfer before editing.', 409)
    }

    const oldAccount = await this.accountRepo.findById(oldTx.account_id)
    if (!oldAccount) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(oldAccount)
    if (oldAccount.type === 'investment') throw AppError.validation('Legacy cash rows on holdings are read-only; use the linked investment trade flow')

    const newAccountId = dto.account_id || oldTx.account_id
    const newAmount = dto.amount ?? oldTx.amount
    const newStatus = this.resolveUpdateStatus(oldTx, dto, today)
    const now = Date.now()
    let targetAccount = oldAccount
    if (newAccountId !== oldTx.account_id) {
      const target = await this.accountRepo.findById(newAccountId)
      if (!target) throw new Error('Account not found')
      targetAccount = target
      this.assertAccountUnlocked(targetAccount)
      if (targetAccount.type === 'investment') throw AppError.validation('Use the linked trade flow instead of moving an ordinary cash row to a holding')
    }

    const next: Transaction = { ...oldTx,
      account_id: newAccountId,
      category_id: dto.category_id !== undefined ? dto.category_id : oldTx.category_id,
      amount: newAmount,
      description: dto.description !== undefined ? dto.description : oldTx.description,
      date: dto.date || oldTx.date,
      exclude_from_estimate: dto.exclude_from_estimate !== undefined ? dto.exclude_from_estimate : oldTx.exclude_from_estimate,
      status: newStatus,
      confirmed_at: newStatus === 'posted' ? (oldTx.confirmed_at ?? now) : null,
      cancelled_at: null, updated_at: now,
    }
    await this.transactionRepo.cashLedger.commit({ before: [oldTx], after: [next], accounts: [oldAccount, targetAccount], now })
    return { ...(await this.transactionRepo.findById(id))!, auditRecorded: true }
  }

  private async updatePendingTransferReview(tx: Transaction, pair: Transaction, dto: UpdateTransactionDto): Promise<Transaction> {
    if (pair.linked_transaction_id !== tx.id || pair.status !== 'pending'
      || pair.pending_kind !== 'mcp_review' || pair.review_source !== 'chatgpt_mcp'
      || !tx.review_batch_id || tx.review_batch_id !== pair.review_batch_id
      || tx.amount * pair.amount >= 0 || tx.date !== pair.date) {
      throw new Error('Transfer review pair is invalid')
    }
    if (dto.category_id !== undefined || dto.price !== undefined || dto.exclude_from_estimate !== undefined) {
      throw new Error('Transfer review can only change accounts, amounts, date, and note')
    }

    const outgoing = tx.amount < 0 ? tx : pair
    const incoming = tx.amount < 0 ? pair : tx
    const fromAccountId = dto.account_id ?? outgoing.account_id
    const toAccountId = dto.to_account_id ?? incoming.account_id
    const amountFrom = dto.amount ?? Math.abs(outgoing.amount)
    const amountTo = dto.amount_to ?? incoming.amount
    const date = dto.date ?? outgoing.date
    const description = dto.description === undefined ? outgoing.description ?? null : dto.description?.trim() || null

    if (fromAccountId === toAccountId) throw new Error('Cannot transfer to same account')
    if ((fromAccountId !== outgoing.account_id || toAccountId !== incoming.account_id)
      && (dto.amount === undefined || dto.amount_to === undefined)) {
      throw new Error('Transfer review account changes require both amounts')
    }
    if (![amountFrom, amountTo].every(amount => Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000_000_000)) {
      throw new Error('Transfer amounts must be positive and finite')
    }

    const accountIds = new Set([outgoing.account_id, incoming.account_id, fromAccountId, toAccountId])
    const accounts = new Map<string, Account>()
    for (const accountId of accountIds) {
      const account = await this.accountRepo.findById(accountId)
      if (!account) throw new Error('Account not found')
      if (!['cash', 'checking', 'savings'].includes(account.type)) throw new Error('Transfer review requires cash accounts')
      this.assertAccountUnlocked(account)
      accounts.set(accountId, account)
    }
    if (accounts.get(fromAccountId)!.currency.toUpperCase() === accounts.get(toAccountId)!.currency.toUpperCase()
      && amountFrom !== amountTo) {
      throw new Error('Same-currency transfer amounts must match')
    }

    const updated = await this.transactionRepo.updatePendingTransferReviewPair(outgoing, incoming, {
      fromAccountId, toAccountId, amountFrom, amountTo, date, description,
    }, Date.now())
    if (!updated) throw new Error('Transfer review changed; refresh and try again')
    return (await this.transactionRepo.findById(tx.id))!
  }

  private async updateTransferPair(tx: Transaction, linkedTx: Transaction, dto: UpdateTransactionDto): Promise<TransactionMutationResult> {
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

    if ([...accounts.values()].some(a => a.type === 'investment')) throw AppError.validation('Cash transfers cannot be reinterpreted as investment trades; use the linked trade flow')

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

    if (linkedTx.linked_transaction_id !== tx.id || !this.isPosted(linkedTx) || tx.date !== linkedTx.date || outgoing.amount >= 0 || incoming.amount <= 0) {
      throw AppError.validation('Invalid reciprocal cash transfer')
    }
    const nextOutgoing: Transaction = {
      ...outgoing, account_id: fromAccountId, category_id: null, amount: -amountFrom,
      description: outgoingDescription, date, exclude_from_estimate: false, updated_at: now,
    }
    const nextIncoming: Transaction = {
      ...incoming, account_id: toAccountId, category_id: null, amount: amountTo,
      description: incomingDescription, date, exclude_from_estimate: false, updated_at: now,
    }
    await this.transactionRepo.cashLedger.commit({ before: [outgoing, incoming], after: [nextOutgoing, nextIncoming], accounts: [...accounts.values()], now })
    return { ...(await this.transactionRepo.findById(requestedId))!, auditRecorded: true }
  }

  private async updateInvestmentTransfer(outgoing: Transaction, investmentTx: InvestmentTransaction, dto: UpdateTransactionDto, today?: string): Promise<TransactionMutationResult> {
    const cashId = dto.account_id || outgoing.account_id
    const holdingId = dto.to_account_id || investmentTx.account_id
    const result = await new InvestmentTradeService(this.investmentTransactionRepo.trades).save({
      idempotency_key: dto.idempotency_key || crypto.randomUUID(), holding_account_id: holdingId, cash_account_id: cashId,
      expected_version:dto.expected_version ?? investmentTx.trade_version,
      type: investmentTx.type, quantity: dto.amount_to ?? investmentTx.quantity,
      price: dto.price ?? investmentTx.price, execution_currency: dto.execution_currency ?? investmentTx.execution_currency!,
      cash_amount: Math.abs(dto.amount ?? outgoing.amount), date: dto.date || outgoing.date,
      fee_status: dto.fee_status ?? investmentTx.fee_status!, fee_amount: dto.fee_amount !== undefined ? dto.fee_amount : investmentTx.fee_amount,
      notes: dto.description !== undefined ? dto.description : investmentTx.notes,
    },today,investmentTx.id)
    return { ...(await this.transactionRepo.findById(result.cash_transaction_id))!, auditRecorded:true }
  }

  // True means auditing was included in the pair batch, or deletion was a no-op.
  async deleteTransaction(id: string, today?: string): Promise<boolean> {
    // Get transaction to revert balance
    const tx = await this.transactionRepo.findById(id)

    if (tx) {
      this.assertNotSplitLine(tx)
      const investmentLink = await this.investmentTransactionRepo.findByCashTransactionId(id)
      if (investmentLink && investmentLink.id !== tx.linked_transaction_id) {
        throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Investment transfer links are inconsistent; repair the pair before deleting.', 409)
      }
      if (tx.linked_transaction_id && tx.status === 'pending') {
        throw new Error('Pending transfer review pairs must be declined together')
      }
      const account = await this.accountRepo.findById(tx.account_id)
      if (account) {
        this.assertAccountUnlocked(account)
      }

      let linkedTx: Transaction | null = null
      let linkedAccount: Account | null = null

      if (tx.linked_transaction_id) {
        linkedTx = await this.transactionRepo.findById(tx.linked_transaction_id)
        const investmentTx = await this.investmentTransactionRepo.findById(tx.linked_transaction_id)
        if (linkedTx && investmentTx) {
          throw new AppError('INVESTMENT_TRANSFER_CONFLICT', 'Linked transaction ID is ambiguous; repair the transfer before deleting.', 409)
        }
        if (linkedTx) {
          linkedAccount = await this.accountRepo.findById(linkedTx.account_id)
          if (linkedAccount) {
            this.assertAccountUnlocked(linkedAccount)
          }
        } else {
          if (investmentTx) {
            const investmentAccount = await this.accountRepo.findById(investmentTx.account_id)
            if (investmentAccount) this.assertAccountUnlocked(investmentAccount)
            await new InvestmentTradeService(this.investmentTransactionRepo.trades).remove(investmentTx.id,today)
            return true
          }
          // Another deletion may have removed the pair after our initial read.
          // Never refund a stale row or treat an orphaned transfer as cash-only.
          if (!await this.transactionRepo.findById(id)) return true
          throw new Error('Linked transaction not found')
        }
      }

      if (account?.type === 'investment' || linkedAccount?.type === 'investment') throw AppError.validation('Legacy cash rows on holdings are read-only until reconciled')

      if (!account || (linkedTx && !linkedAccount)) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
      if (linkedTx && (linkedTx.linked_transaction_id !== tx.id || !this.isPosted(linkedTx) || !this.isPosted(tx) || tx.date !== linkedTx.date || tx.amount * linkedTx.amount >= 0)) {
        throw AppError.validation('Invalid reciprocal cash transfer')
      }
      await this.transactionRepo.cashLedger.commit({
        before: linkedTx ? [tx, linkedTx] : [tx], after: [],
        accounts: linkedAccount ? [account, linkedAccount] : [account], now: Date.now(),
      })
      return true
    }
    return true
  }

  async getUpcomingTransactions(): Promise<Transaction[]> {
    return await this.transactionRepo.findUpcoming()
  }

  async confirmTransaction(id: string, today?: string): Promise<TransactionMutationResult> {
    const tx = await this.transactionRepo.findById(id)

    if (!tx) {
      throw new Error('Transaction not found')
    }

    this.assertNotSplitLine(tx)

    if (tx.linked_transaction_id) return this.resolveTransferReview(tx, 'confirm', today)

    if ((tx.status || 'posted') === 'posted') {
      return { ...tx, auditRecorded: true }
    }

    if ((tx.status || 'posted') !== 'pending') {
      throw new Error('Transaction is not pending confirmation')
    }

    const effectiveToday = this.todayString(today)
    if (tx.date > effectiveToday) {
      throw new Error('Cannot confirm a transaction dated in the future')
    }

    const account = await this.accountRepo.findById(tx.account_id)
    if (!account) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(account)
    if (account.type === 'investment') throw AppError.validation('Investment posting requires a complete linked trade; this pending cash row cannot be confirmed')

    const now = Date.now()
    const confirmed = await this.transactionRepo.confirmPendingAndApplyBalance(tx, now, effectiveToday)

    const updated = await this.transactionRepo.findById(id)
    if (!confirmed && updated?.status !== 'posted') {
      throw new AppError('HISTORY_CHANGED', 'Pending transaction changed or became protected; refresh before confirming.', 409)
    }

    return { ...updated!, auditRecorded: true }
  }

  async declineTransaction(id: string): Promise<TransactionMutationResult> {
    const tx = await this.transactionRepo.findById(id)

    if (!tx) {
      throw new Error('Transaction not found')
    }

    this.assertNotSplitLine(tx)

    if (tx.linked_transaction_id) return this.resolveTransferReview(tx, 'decline')

    if ((tx.status || 'posted') !== 'pending') {
      throw new Error('Transaction is not pending confirmation')
    }

    const account = await this.accountRepo.findById(tx.account_id)
    if (!account) {
      throw new Error('Account not found')
    }
    this.assertAccountUnlocked(account)

    const now = Date.now()
    const next: Transaction = { ...tx, status: 'cancelled', cancelled_at: now, updated_at: now }
    await this.transactionRepo.cashLedger.commit({ before: [tx], after: [next], accounts: [account], now })
    return { ...(await this.transactionRepo.findById(id))!, auditRecorded: true }
  }

  private async resolveTransferReview(tx: Transaction, action: 'confirm' | 'decline', today?: string): Promise<Transaction> {
    if (tx.pending_kind !== 'mcp_review' || tx.review_source !== 'chatgpt_mcp') {
      throw new Error(`Linked transfers cannot be ${action === 'confirm' ? 'confirmed' : 'declined'} as upcoming transactions`)
    }
    const pair = await this.transactionRepo.findById(tx.linked_transaction_id!)
    if (!pair || pair.linked_transaction_id !== tx.id || pair.review_batch_id !== tx.review_batch_id
      || pair.pending_kind !== 'mcp_review' || pair.review_source !== 'chatgpt_mcp'
      || tx.amount * pair.amount >= 0 || tx.date !== pair.date) {
      throw new Error('Transfer review pair is invalid')
    }
    if (action === 'confirm' && tx.status === 'posted' && pair.status === 'posted') return tx
    if (tx.status !== 'pending' || pair.status !== 'pending') throw new Error('Transfer review pair is not pending')
    const effectiveToday = this.todayString(today)
    if (action === 'confirm' && tx.date > effectiveToday) throw new Error('Cannot confirm a transaction dated in the future')
    const [source, destination] = await Promise.all([
      this.accountRepo.findById(tx.account_id), this.accountRepo.findById(pair.account_id),
    ])
    if (!source || !destination || !['cash', 'checking', 'savings'].includes(source.type) || !['cash', 'checking', 'savings'].includes(destination.type)
      || source.id === destination.id || (source.currency.toUpperCase() === destination.currency.toUpperCase() && tx.amount + pair.amount !== 0)) {
      throw new Error('Transfer review accounts or amounts are invalid')
    }
    this.assertAccountUnlocked(source)
    this.assertAccountUnlocked(destination)
    const debit = tx.amount < 0 ? tx : pair
    const credit = tx.amount < 0 ? pair : tx
    const resolved = await this.transactionRepo.resolvePendingTransferPair(debit, credit, action, Date.now(), effectiveToday)
    const updated = await this.transactionRepo.findById(tx.id)
    if (!resolved && updated?.status !== (action === 'confirm' ? 'posted' : 'cancelled')) {
      throw new Error('Transfer review pair is not pending')
    }
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
