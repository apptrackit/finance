import { z } from 'zod'
import { AppError } from '../errors/codes'
import { TransactionHistoryRepository } from '../repositories/transaction-history.repository'
import { TransactionMapper } from '../mappers/transaction.mapper'
import { InvestmentTransactionMapper } from '../mappers/investment-transaction.mapper'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(500),
  startDate: date.optional(), endDate: date.optional(),
  cursor: z.string().min(1).max(4096).optional(),
}).strict().refine(query => (!query.startDate === !query.endDate)
  && (!query.startDate || query.startDate <= query.endDate!), 'Provide an ordered startDate/endDate pair')
const cursorSchema = z.object({
  date, kind: z.enum(['cash', 'investment']), sequence: z.number().int().positive().safe(),
  revision: z.number().int().nonnegative(), startDate: date.optional(), endDate: date.optional(),
}).strict()

export class TransactionHistoryService {
  constructor(private repository: TransactionHistoryRepository) {}

  async getPage(input: Record<string, string>) {
    const query = querySchema.safeParse(input)
    if (!query.success) throw AppError.validation('Invalid history query')
    const { limit, startDate, endDate, cursor } = query.data
    let after: z.infer<typeof cursorSchema> | undefined
    if (cursor) {
      try {
        const bytes = Uint8Array.from(atob(cursor), character => character.charCodeAt(0))
        after = cursorSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
      } catch { throw AppError.validation('Invalid history cursor') }
      if (after.startDate !== startDate || after.endDate !== endDate) {
        throw AppError.validation('History cursor does not match the date range')
      }
    }
    const page = await this.repository.readPage({ limit, startDate, endDate, after })
    if (after && after.revision !== page.revision) {
      throw new AppError('HISTORY_CHANGED', 'History changed while loading. Retry from the first page.', 409)
    }
    const next = page.next ? { date: page.next.date, kind: page.next.kind, sequence: page.next.sequence,
      revision: page.revision, startDate, endDate } : null
    return {
      transactions: page.transactions.map(TransactionMapper.toResponseDto),
      investments: page.investments.map(InvestmentTransactionMapper.toResponseDto),
      revision: page.revision,
      nextCursor: next ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(next)))) : null,
    }
  }
}
