import { RecurringSchedule } from '../models/RecurringSchedule'

export class RecurringScheduleRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<RecurringSchedule[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM recurring_schedules ORDER BY created_at DESC')
      .all<RecurringSchedule>()
    return results
  }

  async findActive(): Promise<RecurringSchedule[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM recurring_schedules WHERE is_active = 1')
      .all<RecurringSchedule>()
    return results
  }

  async findById(id: string): Promise<RecurringSchedule | null> {
    return await this.db
      .prepare('SELECT * FROM recurring_schedules WHERE id = ?')
      .bind(id)
      .first<RecurringSchedule>()
  }

  async create(schedule: RecurringSchedule): Promise<void> {
    await this.db.prepare(
      `INSERT INTO recurring_schedules 
       (id, type, frequency, day_of_week, day_of_month, account_id, to_account_id, 
        category_id, amount, amount_to, description, is_active, created_at, last_processed_date, 
        remaining_occurrences, end_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      schedule.id,
      schedule.type,
      schedule.frequency,
      schedule.day_of_week ?? null,
      schedule.day_of_month ?? null,
      schedule.account_id,
      schedule.to_account_id ?? null,
      schedule.category_id ?? null,
      schedule.amount,
      schedule.amount_to ?? null,
      schedule.description ?? null,
      schedule.is_active ? 1 : 0,
      schedule.created_at,
      schedule.last_processed_date ?? null,
      schedule.remaining_occurrences ?? null,
      schedule.end_date ?? null
    ).run()
  }

  async update(id: string, updates: Partial<RecurringSchedule>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.frequency !== undefined) {
      fields.push('frequency = ?')
      values.push(updates.frequency)
    }
    if (updates.day_of_week !== undefined) {
      fields.push('day_of_week = ?')
      values.push(updates.day_of_week ?? null)
    }
    if (updates.day_of_month !== undefined) {
      fields.push('day_of_month = ?')
      values.push(updates.day_of_month ?? null)
    }
    if (updates.account_id !== undefined) {
      fields.push('account_id = ?')
      values.push(updates.account_id)
    }
    if (updates.to_account_id !== undefined) {
      fields.push('to_account_id = ?')
      values.push(updates.to_account_id ?? null)
    }
    if (updates.category_id !== undefined) {
      fields.push('category_id = ?')
      values.push(updates.category_id ?? null)
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?')
      values.push(updates.amount)
    }
    if (updates.amount_to !== undefined) {
      fields.push('amount_to = ?')
      values.push(updates.amount_to ?? null)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description ?? null)
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?')
      values.push(updates.is_active ? 1 : 0)
    }
    if (updates.last_processed_date !== undefined) {
      fields.push('last_processed_date = ?')
      values.push(updates.last_processed_date ?? null)
    }
    if (updates.remaining_occurrences !== undefined) {
      fields.push('remaining_occurrences = ?')
      values.push(updates.remaining_occurrences === null ? null : updates.remaining_occurrences)
    }
    if (updates.end_date !== undefined) {
      fields.push('end_date = ?')
      values.push(updates.end_date === null ? null : updates.end_date)
    }

    if (fields.length === 0) return

    values.push(id)
    await this.db.prepare(
      `UPDATE recurring_schedules SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM recurring_schedules WHERE id = ?').bind(id).run()
  }
}
