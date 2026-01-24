import { RecurringScheduleRepository } from '../repositories/recurring-schedule.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { AccountRepository } from '../repositories/account.repository'
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto, RecurringScheduleResponseDto } from '../dtos/recurring-schedule.dto'
import { RecurringSchedule } from '../models/RecurringSchedule'
import { Transaction } from '../models/Transaction'

export class RecurringScheduleService {
  constructor(
    private recurringRepo: RecurringScheduleRepository,
    private transactionRepo: TransactionRepository,
    private accountRepo: AccountRepository
  ) {}

  async getAllSchedules(): Promise<RecurringScheduleResponseDto[]> {
    const schedules = await this.recurringRepo.findAll()
    return schedules.map(s => this.toDto(s))
  }

  async getScheduleById(id: string): Promise<RecurringScheduleResponseDto> {
    const schedule = await this.recurringRepo.findById(id)
    if (!schedule) {
      throw new Error('Recurring schedule not found')
    }
    return this.toDto(schedule)
  }

  async createSchedule(dto: CreateRecurringScheduleDto): Promise<RecurringScheduleResponseDto> {
    // Validate inputs
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(dto.frequency)) {
      throw new Error('Invalid frequency')
    }

    if (!['transaction', 'transfer'].includes(dto.type)) {
      throw new Error('Invalid type')
    }

    // Validate frequency-specific fields
    if (dto.frequency === 'weekly' && (dto.day_of_week === undefined || dto.day_of_week < 0 || dto.day_of_week > 6)) {
      throw new Error('day_of_week must be between 0-6 for weekly frequency')
    }

    if (dto.frequency === 'monthly' && (dto.day_of_month === undefined || dto.day_of_month < 1 || dto.day_of_month > 31)) {
      throw new Error('day_of_month must be between 1-31 for monthly frequency')
    }

    if (dto.frequency === 'yearly' && (dto.day_of_month === undefined || dto.day_of_month < 1 || dto.day_of_month > 31)) {
      throw new Error('day_of_month must be between 1-31 for yearly frequency')
    }

    if (dto.frequency === 'yearly' && (dto.month === undefined || dto.month < 0 || dto.month > 11)) {
      throw new Error('month must be between 0-11 for yearly frequency')
    }

    // Validate type-specific fields
    if (dto.type === 'transaction' && !dto.category_id) {
      throw new Error('category_id is required for transaction type')
    }

    if (dto.type === 'transfer' && !dto.to_account_id) {
      throw new Error('to_account_id is required for transfer type')
    }

    if (dto.type === 'transfer' && dto.to_account_id === dto.account_id) {
      throw new Error('Cannot transfer to same account')
    }

    // Validate accounts exist
    const account = await this.accountRepo.findById(dto.account_id)
    if (!account) {
      throw new Error('Account not found')
    }

    if (dto.to_account_id) {
      const toAccount = await this.accountRepo.findById(dto.to_account_id)
      if (!toAccount) {
        throw new Error('To account not found')
      }
    }

    const schedule: RecurringSchedule = {
      id: crypto.randomUUID(),
      type: dto.type,
      frequency: dto.frequency,
      day_of_week: dto.day_of_week,
      day_of_month: dto.day_of_month,
      month: dto.month,
      account_id: dto.account_id,
      to_account_id: dto.to_account_id,
      category_id: dto.category_id,
      amount: dto.amount,
      amount_to: dto.amount_to,
      description: dto.description,
      is_active: true,
      created_at: Date.now(),
      last_processed_date: undefined,
      remaining_occurrences: dto.remaining_occurrences ?? undefined,
      end_date: dto.end_date ?? undefined
    }

    await this.recurringRepo.create(schedule)
    return this.toDto(schedule)
  }

  async updateSchedule(id: string, dto: UpdateRecurringScheduleDto): Promise<RecurringScheduleResponseDto> {
    const existing = await this.recurringRepo.findById(id)
    if (!existing) {
      throw new Error('Recurring schedule not found')
    }

    // Validate frequency-specific fields if being updated
    if (dto.frequency === 'weekly' && dto.day_of_week !== undefined && (dto.day_of_week < 0 || dto.day_of_week > 6)) {
      throw new Error('day_of_week must be between 0-6 for weekly frequency')
    }

    if (dto.frequency === 'monthly' && dto.day_of_month !== undefined && (dto.day_of_month < 1 || dto.day_of_month > 31)) {
      throw new Error('day_of_month must be between 1-31 for monthly frequency')
    }

    if (dto.frequency === 'yearly' && dto.day_of_month !== undefined && (dto.day_of_month < 1 || dto.day_of_month > 31)) {
      throw new Error('day_of_month must be between 1-31 for yearly frequency')
    }

    if (dto.frequency === 'yearly' && dto.month !== undefined && (dto.month < 0 || dto.month > 11)) {
      throw new Error('month must be between 0-11 for yearly frequency')
    }

    // Convert null to undefined for fields that don't accept null
    const updateData: Partial<RecurringSchedule> = {
      ...dto,
      remaining_occurrences: dto.remaining_occurrences ?? undefined,
      end_date: dto.end_date ?? undefined
    }

    await this.recurringRepo.update(id, updateData)
    const updated = await this.recurringRepo.findById(id)
    return this.toDto(updated!)
  }

  async deleteSchedule(id: string): Promise<void> {
    const existing = await this.recurringRepo.findById(id)
    if (!existing) {
      throw new Error('Recurring schedule not found')
    }
    await this.recurringRepo.delete(id)
  }

  async processRecurringSchedules(): Promise<void> {
    const activeSchedules = await this.recurringRepo.findActive()
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD

    for (const schedule of activeSchedules) {
      // Check if end_date has passed
      if (schedule.end_date && todayStr > schedule.end_date) {
        // Deactivate the schedule as it has expired
        await this.recurringRepo.update(schedule.id, { is_active: false })
        console.log(`Deactivated expired recurring schedule ${schedule.id} (end_date: ${schedule.end_date})`)
        continue
      }

      // Check if remaining_occurrences is 0 (but not null/undefined which means unlimited)
      if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null && schedule.remaining_occurrences <= 0) {
        // Deactivate the schedule as it has no remaining occurrences
        await this.recurringRepo.update(schedule.id, { is_active: false })
        console.log(`Deactivated recurring schedule ${schedule.id} (no remaining occurrences)`)
        continue
      }

      // Check if we should process this schedule today
      if (!this.shouldProcessToday(schedule, today)) {
        continue
      }

      // Check if already processed today
      if (schedule.last_processed_date === todayStr) {
        continue
      }

      try {
        // Process based on type
        if (schedule.type === 'transaction') {
          await this.processRecurringTransaction(schedule, todayStr)
        } else if (schedule.type === 'transfer') {
          await this.processRecurringTransfer(schedule, todayStr)
        }

        // Update last processed date and decrement remaining_occurrences
        const updates: Partial<RecurringSchedule> = { last_processed_date: todayStr }
        
        if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences !== null && schedule.remaining_occurrences > 0) {
          updates.remaining_occurrences = schedule.remaining_occurrences - 1
          
          // If this was the last occurrence, deactivate the schedule
          if (updates.remaining_occurrences === 0) {
            updates.is_active = false
          }
        }
        
        await this.recurringRepo.update(schedule.id, updates)
        console.log(`Processed recurring schedule ${schedule.id} for ${todayStr}`)
      } catch (error) {
        console.error(`Failed to process recurring schedule ${schedule.id}:`, error)
      }
    }
  }

  private shouldProcessToday(schedule: RecurringSchedule, today: Date): boolean {
    const dayOfWeek = today.getDay() // 0-6
    const dayOfMonth = today.getDate() // 1-31

    switch (schedule.frequency) {
      case 'daily':
        return true
      case 'weekly':
        return dayOfWeek === schedule.day_of_week
      case 'monthly':
        // Handle edge case: if day_of_month is 31 but month has fewer days, process on last day
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
        const targetDay = schedule.day_of_month!
        if (targetDay > lastDayOfMonth) {
          return dayOfMonth === lastDayOfMonth
        }
        return dayOfMonth === targetDay
      case 'yearly':
        // Check if today matches the yearly schedule date
        const month = today.getMonth() // 0-11
        const targetMonth = schedule.month !== undefined ? schedule.month : new Date(schedule.created_at).getMonth()
        
        if (month !== targetMonth) {
          return false
        }
        
        // Handle edge case: if day_of_month is 31 but month has fewer days, process on last day
        const lastDayOfTargetMonth = new Date(today.getFullYear(), month + 1, 0).getDate()
        const yearlyTargetDay = schedule.day_of_month!
        if (yearlyTargetDay > lastDayOfTargetMonth) {
          return dayOfMonth === lastDayOfTargetMonth
        }
        return dayOfMonth === yearlyTargetDay
      default:
        return false
    }
  }

  private async processRecurringTransaction(schedule: RecurringSchedule, date: string): Promise<void> {
    const account = await this.accountRepo.findById(schedule.account_id)
    if (!account) {
      console.error(`Account ${schedule.account_id} not found for recurring schedule ${schedule.id}`)
      return
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      account_id: schedule.account_id,
      category_id: schedule.category_id,
      amount: schedule.amount,
      description: schedule.description,
      date: date,
      linked_transaction_id: undefined
    }

    await this.transactionRepo.create(transaction)

    // Update account balance
    await this.accountRepo.updateBalance(
      schedule.account_id,
      account.balance + schedule.amount,
      Date.now()
    )
  }

  private async processRecurringTransfer(schedule: RecurringSchedule, date: string): Promise<void> {
    if (!schedule.to_account_id) {
      console.error(`to_account_id missing for transfer schedule ${schedule.id}`)
      return
    }

    const fromAccount = await this.accountRepo.findById(schedule.account_id)
    const toAccount = await this.accountRepo.findById(schedule.to_account_id)

    if (!fromAccount || !toAccount) {
      console.error(`Account(s) not found for recurring transfer ${schedule.id}`)
      return
    }

    const outgoingId = crypto.randomUUID()
    const incomingId = crypto.randomUUID()

    // Build description with exchange rate info if currencies differ
    let outgoingDesc = `Transfer to ${toAccount.name}`
    let incomingDesc = `Transfer from ${fromAccount.name}`

    const amountTo = schedule.amount_to ?? schedule.amount

    if (fromAccount.currency !== toAccount.currency && schedule.amount_to) {
      const effectiveRate = schedule.amount_to / schedule.amount
      outgoingDesc += ` (${schedule.amount_to.toFixed(2)} ${toAccount.currency} @ ${effectiveRate.toFixed(4)})`
      incomingDesc += ` (${schedule.amount.toFixed(2)} ${fromAccount.currency} @ ${effectiveRate.toFixed(4)})`
    }

    if (schedule.description) {
      outgoingDesc += ` - ${schedule.description}`
      incomingDesc += ` - ${schedule.description}`
    }

    // Create outgoing transaction
    const outgoing: Transaction = {
      id: outgoingId,
      account_id: schedule.account_id,
      amount: -Math.abs(schedule.amount),
      description: outgoingDesc,
      date: date,
      linked_transaction_id: incomingId
    }

    // Create incoming transaction
    const incoming: Transaction = {
      id: incomingId,
      account_id: schedule.to_account_id,
      amount: Math.abs(amountTo),
      description: incomingDesc,
      date: date,
      linked_transaction_id: outgoingId
    }

    await this.transactionRepo.create(outgoing)
    await this.transactionRepo.create(incoming)

    // Update account balances
    await this.accountRepo.updateBalance(
      schedule.account_id,
      fromAccount.balance - Math.abs(schedule.amount),
      Date.now()
    )

    await this.accountRepo.updateBalance(
      schedule.to_account_id,
      toAccount.balance + Math.abs(amountTo),
      Date.now()
    )
  }

  private toDto(schedule: RecurringSchedule): RecurringScheduleResponseDto {
    return {
      id: schedule.id,
      type: schedule.type,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week,
      day_of_month: schedule.day_of_month,
      account_id: schedule.account_id,
      to_account_id: schedule.to_account_id,
      category_id: schedule.category_id,
      amount: schedule.amount,
      amount_to: schedule.amount_to,
      description: schedule.description,
      is_active: schedule.is_active,
      created_at: schedule.created_at,
      last_processed_date: schedule.last_processed_date,
      remaining_occurrences: schedule.remaining_occurrences,
      end_date: schedule.end_date
    }
  }
}
