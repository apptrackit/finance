import { AppError } from '../errors/codes'
import { Account } from '../models/Account'
import { Transaction } from '../models/Transaction'
import { SaveSplitDto } from '../dtos/transaction-split.dto'
import { AccountRepository } from '../repositories/account.repository'
import { SplitWrite, TransactionSplit, TransactionSplitRepository } from '../repositories/transaction-split.repository'

export interface SavedSplit {
  split: TransactionSplit
  lines: Transaction[]
  total: number
}

const round = (value: number) => Math.round(value * 1e8) / 1e8

export class TransactionSplitService {
  constructor(
    private splitRepo: TransactionSplitRepository,
    private accountRepo: AccountRepository,
  ) {}

  private todayString(today?: string): string {
    return today || new Date().toISOString().slice(0, 10)
  }

  private assertUsable(account: Account | null): Account {
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found')
    if (account.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED', 'Restore this account before making changes.', 409)
    if (account.is_locked) throw new AppError('ACCOUNT_LOCKED', `Account "${account.name}" is locked`, 409)
    if (account.type === 'investment') throw AppError.validation('Investment accounts cannot be split')
    return account
  }

  private prepare(dto: SaveSplitDto, id: string, today?: string): SplitWrite {
    if (dto.date > this.todayString(today)) {
      throw AppError.validation('A split cannot be dated in the future')
    }
    const negative = dto.lines[0].amount < 0
    if (dto.lines.some(line => (line.amount < 0) !== negative)) {
      throw AppError.validation('All split lines must be income or all must be expenses')
    }
    const lines = dto.lines.map(line => ({
      id: crypto.randomUUID(),
      category_id: line.category_id,
      amount: line.amount,
      // An undone split keeps the shared payee as the transaction description.
      description: (dto.lines.length === 1 ? dto.description?.trim() : '') || line.note?.trim() || null,
    }))
    const total = round(lines.reduce((sum, line) => sum + line.amount, 0))
    if (dto.balance_adjustment) {
      const { expected_balance, new_balance } = dto.balance_adjustment
      if (Math.abs(round(expected_balance + total) - new_balance) > 1e-6) {
        throw AppError.validation('The split total must equal the balance change')
      }
    }
    return {
      id,
      account_id: dto.account_id,
      date: dto.date,
      description: dto.description?.trim() || null,
      exclude_from_estimate: dto.exclude_from_estimate ?? false,
      lines,
      total,
    }
  }

  private async load(id: string): Promise<SavedSplit> {
    const split = await this.splitRepo.findById(id)
    const lines = split ? await this.splitRepo.findLines(id) : []
    if (!split || lines.length === 0) throw AppError.notFound('TRANSACTION_NOT_FOUND', 'Split not found')
    if (lines.some(line => line.status !== 'posted')) throw AppError.validation('Only posted splits can be changed')
    return { split, lines, total: round(lines.reduce((sum, line) => sum + line.amount, 0)) }
  }

  private conflict(): AppError {
    return new AppError('SPLIT_CONFLICT', 'This split changed. Refresh and try again.', 409)
  }

  async create(dto: SaveSplitDto, today?: string): Promise<SavedSplit> {
    this.assertUsable(await this.accountRepo.findById(dto.account_id))
    const write = this.prepare(dto, crypto.randomUUID(), today)
    // The balance the client saw guards the batch, so a concurrent change rejects the adjustment.
    const applied = await this.splitRepo.create(write, Date.now(), dto.balance_adjustment?.expected_balance)
    if (!applied) throw this.conflict()
    return this.load(write.id)
  }

  async update(id: string, dto: SaveSplitDto, today?: string): Promise<SavedSplit> {
    const previous = await this.load(id)
    this.assertUsable(await this.accountRepo.findById(previous.lines[0].account_id))
    this.assertUsable(await this.accountRepo.findById(dto.account_id))
    const write = this.prepare(dto, id, today)
    const now = Math.max(Date.now(), (previous.split.updated_at ?? 0) + 1)
    const applied = await this.splitRepo.replace(previous, write, now, dto.balance_adjustment?.expected_balance)
    if (!applied) throw this.conflict()
    if (write.lines.length === 1) {
      // Undone split: the remaining line is an ordinary transaction and the split row is gone.
      const line = (await this.splitRepo.findTransaction(write.lines[0].id))!
      return { split: { id, description: write.description, created_at: previous.split.created_at, updated_at: now }, lines: [line], total: write.total }
    }
    return this.load(id)
  }

  async delete(id: string): Promise<SavedSplit> {
    const previous = await this.load(id)
    this.assertUsable(await this.accountRepo.findById(previous.lines[0].account_id))
    const now = Math.max(Date.now(), (previous.split.updated_at ?? 0) + 1)
    if (!await this.splitRepo.remove(previous, now)) throw this.conflict()
    return previous
  }
}
