import { Context } from 'hono'
import { SaveSplitDto, TransactionSplitResponseDto } from '../dtos/transaction-split.dto'
import { TransactionMapper } from '../mappers/transaction.mapper'
import { SavedSplit, TransactionSplitService } from '../services/transaction-split.service'

export class TransactionSplitController {
  constructor(private splitService: TransactionSplitService) {}

  private getClientDate(c: Context): string | undefined {
    const clientDate = c.req.header('X-Client-Date')
    return clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate) ? clientDate : undefined
  }

  private toResponse({ split, lines, total }: SavedSplit): TransactionSplitResponseDto {
    return {
      id: split.id,
      description: split.description,
      account_id: lines[0].account_id,
      date: lines[0].date,
      exclude_from_estimate: lines[0].exclude_from_estimate === true,
      total,
      lines: lines.map(TransactionMapper.toResponseDto),
    }
  }

  // Validation errors, conflicts and not-found cases are AppErrors handled by the app error handler.
  async create(c: Context) {
    const body = c.get('validatedBody') as SaveSplitDto
    return c.json(this.toResponse(await this.splitService.create(body, this.getClientDate(c))), 201)
  }

  async update(c: Context) {
    const body = c.get('validatedBody') as SaveSplitDto
    return c.json(this.toResponse(await this.splitService.update(c.req.param('id'), body, this.getClientDate(c))))
  }

  async delete(c: Context) {
    await this.splitService.delete(c.req.param('id'))
    return c.json({ success: true })
  }

  async confirm(c: Context) {
    return c.json(this.toResponse(await this.splitService.confirm(c.req.param('id'), this.getClientDate(c))))
  }

  async decline(c: Context) {
    return c.json(this.toResponse(await this.splitService.decline(c.req.param('id'))))
  }
}
