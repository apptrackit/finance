import { validLocalDate, validHoldingNumber } from '../../../shared/holding'
import type { PositionAnchor } from '../../../shared/holding'
import type { HoldingOpeningDto } from '../dtos/account.dto'
import { Account } from '../models/Account'
import { AccountRepository } from '../repositories/account.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { CreateAccountDto, UpdateAccountDto } from '../dtos/account.dto'
import { AppError } from '../errors/codes'

const FIAT = new Set(['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'RON', 'MXN'])

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

  async createAccount(dto: CreateAccountDto, clientDate?: string): Promise<Account> {
    const id = crypto.randomUUID()
    const now = Date.now()
    const currency = dto.currency?.trim() || 'HUF'

    let account: Account = {
      id,
      name: dto.name,
      type: dto.type,
      balance: dto.balance,
      currency: currency.toUpperCase(),
      quote_currency: dto.quote_currency?.trim().toUpperCase(),
      symbol: dto.symbol,
      asset_type: dto.asset_type,
      pricing_method: dto.pricing_method, provider: dto.provider, exchange: dto.exchange,
      manual_price: dto.manual_price, manual_price_date: dto.manual_price_date,
      exclude_from_net_worth: dto.exclude_from_net_worth,
      exclude_from_cash_balance: dto.exclude_from_cash_balance,
      updated_at: now
    }

    if (account.type === 'investment') {
      const today = this.today(clientDate)
      const prior = new Date(`${today}T00:00:00Z`); prior.setUTCDate(prior.getUTCDate() - 1)
      const date = dto.opening?.date ?? (account.balance === 0 ? prior.toISOString().slice(0, 10) : '')
      if (!date || !validLocalDate(date) || date > today) throw AppError.validation('A nonzero holding needs a valid opening date on or before today')
      if (dto.opening && dto.opening.balance !== account.balance) throw AppError.validation('The new opening amount must match the starting quantity/value')
      account = this.normalizeHolding(account)
      if (account.manual_price != null) account.manual_price_date = dto.manual_price_date ?? date
      if (account.manual_price_date && (!validLocalDate(account.manual_price_date) || account.manual_price_date > today)) throw AppError.validation('Manual price date cannot be in the future')
      await this.accountRepo.createHolding(account, this.anchor(account.balance, 'opening', date, now, dto.opening))
      return (await this.accountRepo.findById(id))!
    }
    if (dto.opening || dto.manual_price != null || dto.pricing_method) throw AppError.validation('Holding metadata belongs to investment accounts')
    await this.accountRepo.create(account)
    return account
  }

  async updateAccount(id: string, dto: UpdateAccountDto, clientDate?: string): Promise<Account> {
    const existing = await this.requireActive(id)
    const now = Date.now()
    if (dto.type && dto.type !== existing.type && (dto.type === 'investment' || existing.type === 'investment')) throw new AppError('HOLDING_HISTORY_METADATA', 'Create a separate account to change between cash and investment', 409)
    if (existing.type === 'investment') {
      if (dto.adjustWithTransaction || dto.splitTransactions?.length) throw AppError.validation('Use a dated position correction, not an income/expense adjustment, for a holding')
      if (dto.balance !== undefined && dto.balance !== existing.balance && dto.expected_balance === undefined) throw new AppError('HOLDING_POSITION_CONFLICT', 'Refresh and provide the saved quantity/value before correcting a holding', 409)
      if ((dto.expected_balance !== undefined && dto.expected_balance !== existing.balance) || (dto.expected_updated_at !== undefined && dto.expected_updated_at !== existing.updated_at)) throw new AppError('HOLDING_POSITION_CONFLICT', 'Holding changed; refresh before saving', 409)
      const today = this.today(clientDate)
      let next: Account = { ...existing, ...dto, updated_at: now }
      const identityFields = ['currency', 'quote_currency', 'symbol', 'pricing_method', 'provider', 'exchange'] as const
      const identityChanged = identityFields.some(field => dto[field] !== undefined && (dto[field] ?? null) !== (existing[field] ?? null))
      const categoryChanged = dto.asset_type !== undefined && dto.asset_type !== existing.asset_type
      const safeCategoryChange = categoryChanged && ['stock', 'etf'].includes(existing.asset_type || '') && ['stock', 'etf'].includes(dto.asset_type!)
      if ((identityChanged || (categoryChanged && !safeCategoryChange)) && (existing.holding_position?.has_history || existing.balance !== 0)) throw new AppError('HOLDING_HISTORY_METADATA', 'This change would reinterpret existing holding history. Keep its instrument, units, currency and pricing, or create a separate holding.', 409)
      if (identityChanged || (categoryChanged && !safeCategoryChange)) {
        if (next.pricing_method === 'market') next = { ...next, manual_price: null, manual_price_date: null }
        next = this.normalizeHolding(next)
      }
      if (next.balance !== existing.balance && !validHoldingNumber(next.balance)) throw AppError.validation('Invalid holding quantity/value precision or range')
      if (dto.manual_price !== undefined && dto.manual_price != null && (next.asset_type === 'manual' || next.pricing_method !== 'manual' || !validHoldingNumber(dto.manual_price))) throw AppError.validation('A manual unit price requires a manually priced ETF, stock or crypto holding')
      let anchor: PositionAnchor | null = null
      if (dto.opening) {
        if (await this.accountRepo.hasFutureInvestmentActivity(id, today)) throw AppError.validation('Resolve future-dated legacy investment activity before confirming an opening')
        if (!validLocalDate(dto.opening.date) || dto.opening.date > today) throw AppError.validation('Opening date must be on or before today')
        anchor = this.anchor(dto.opening.balance, 'opening', dto.opening.date, now, dto.opening)
      } else if (next.balance !== existing.balance) {
        const date = dto.correction_date ?? today
        if (!validLocalDate(date) || date !== today) throw AppError.validation('A current position correction must use today; supply a dated opening to reconcile earlier history')
        anchor = this.anchor(next.balance, 'correction', date, now, next.asset_type === 'manual' ? { balance: next.balance, date, cost_amount: existing.holding_position?.anchor?.cost_amount, cost_currency: existing.holding_position?.anchor?.cost_currency } : undefined)
      }
      if (dto.manual_price !== undefined && dto.manual_price !== existing.manual_price) next = { ...next, manual_price_date: dto.manual_price == null ? null : dto.manual_price_date ?? today }
      if (next.manual_price_date && (!validLocalDate(next.manual_price_date) || next.manual_price_date > today)) throw AppError.validation('Manual price date cannot be in the future')
      if (!await this.accountRepo.updateHolding(existing, next, anchor)) throw new AppError('HOLDING_POSITION_CONFLICT', 'Holding changed or became protected; refresh before saving', 409)
      return (await this.accountRepo.findById(id))!
    }
    if (dto.opening || dto.manual_price != null || dto.pricing_method) throw AppError.validation('Holding metadata belongs to investment accounts')

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
    delete (updates as any).expected_balance
    delete (updates as any).expected_updated_at
    delete (updates as any).correction_date

    const currency = dto.currency?.trim()
    if (currency) {
      updates.currency = currency.toUpperCase()
    } else {
      delete (updates as any).currency
    }

    const quoteCurrency = dto.quote_currency?.trim()
    if (quoteCurrency) {
      updates.quote_currency = quoteCurrency.toUpperCase()
    } else {
      delete (updates as any).quote_currency
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
    if (!updatedAccount) throw AppError.notFound('ACCOUNT_NOT_FOUND', `Account ${id} not found`)
    return updatedAccount
  }

  private today(clientDate?: string) {
    return clientDate && validLocalDate(clientDate) ? clientDate : new Date().toISOString().slice(0, 10)
  }

  private normalizeHolding(a: Account): Account {
    const category = a.asset_type
    if (!category || !['stock', 'etf', 'crypto', 'manual'].includes(category)) throw AppError.validation('Choose ETF, stock, crypto or manual for the holding')
    if (!validHoldingNumber(a.balance)) throw AppError.validation('Use a nonnegative quantity/value with at most 12 decimal and 15 significant digits (maximum 1 trillion)')
    const total = category === 'manual'
    const method = total ? 'manual' : a.pricing_method || 'market'
    const currency = a.currency.toUpperCase()
    if (total && !FIAT.has(currency)) throw AppError.validation('Manual total assets need a supported fiat currency')
    if ((category === 'stock' || category === 'etf') && currency !== 'SHARE') throw AppError.validation('Stocks and ETFs use SHARE units')
    if (category === 'crypto' && !/^[A-Z0-9]{2,20}$/.test(currency)) throw AppError.validation('Crypto needs its coin unit')
    const quote = total ? currency : a.quote_currency?.toUpperCase()
    if (!quote || !FIAT.has(quote)) throw AppError.validation('Choose a supported fiat quote currency')
    const symbol = a.symbol?.trim().toUpperCase() || undefined
    if (method === 'market' && !symbol) throw AppError.validation('Market pricing needs a canonical provider symbol')
    if (a.manual_price != null && (!validHoldingNumber(a.manual_price) || method !== 'manual' || total)) throw AppError.validation('A per-unit manual price is only valid for manually priced unit holdings')
    return { ...a, currency, quote_currency: quote, unit: total ? 'ITEM' : currency, symbol,
      pricing_method: method, provider: method === 'market' ? 'yahoo' : null,
      exchange: a.exchange?.trim() || null, manual_price: method === 'manual' && !total ? a.manual_price ?? null : null,
      manual_price_date: method === 'manual' && !total ? a.manual_price_date ?? null : null }
  }

  private anchor(balance: number, kind: PositionAnchor['kind'], date: string, now: number, opening?: HoldingOpeningDto): PositionAnchor {
    if (!validHoldingNumber(balance)) throw AppError.validation('Invalid opening quantity/value')
    if (opening?.cost_amount != null && (!Number.isFinite(opening.cost_amount) || opening.cost_amount < 0 || opening.cost_amount > 1e12 || !opening.cost_currency)) throw AppError.validation('Known opening cost needs a valid amount and fiat currency')
    return { id: crypto.randomUUID(), kind, effective_date: date, balance,
      cost_amount: opening?.cost_amount ?? null, cost_currency: opening?.cost_currency ?? null, trade_rowid_boundary: 0, created_at: now }
  }

  async lockAccount(id: string): Promise<Account> {
    await this.requireActive(id, true)
    await this.accountRepo.setLocked(id, true)
    const account = await this.accountRepo.findById(id)
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', `Account ${id} not found`)
    return account
  }

  async unlockAccount(id: string): Promise<Account> {
    const existing = await this.accountRepo.findById(id)
    if (!existing) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
    if (existing.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore this account before making changes.', 409)
    await this.accountRepo.setLocked(id, false)
    const account = await this.accountRepo.findById(id)
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', `Account ${id} not found`)
    return account
  }

  private async requireActive(id: string, allowLocked = false): Promise<Account> {
    const account = await this.accountRepo.findById(id)
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
    if (account.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore this account before making changes.', 409)
    if (account.is_locked && !allowLocked) throw new AppError('ACCOUNT_LOCKED', 'Unlock this account before making changes.', 409)
    return account
  }

  async archiveAccount(id: string): Promise<Account> {
    const account = await this.accountRepo.findById(id)
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
    if (account.archived_at == null) await this.accountRepo.setArchived(id, true)
    return (await this.accountRepo.findById(id))!
  }

  async restoreAccount(id: string): Promise<Account> {
    const account = await this.accountRepo.findById(id)
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
    if (account.archived_at != null) await this.accountRepo.setArchived(id, false)
    return (await this.accountRepo.findById(id))!
  }

  async deleteAccount(id: string): Promise<void> {
    await this.requireActive(id)
    // The database performs guarded ledger cleanup atomically with deletion.
    await this.accountRepo.delete(id)
  }
}
