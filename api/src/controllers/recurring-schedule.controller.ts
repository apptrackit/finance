import { Context } from 'hono'
import { RecurringScheduleService } from '../services/recurring-schedule.service'
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto } from '../dtos/recurring-schedule.dto'

export class RecurringScheduleController {
  constructor(private service: RecurringScheduleService) {}

  async getAll(c: Context) {
    try {
      const schedules = await this.service.getAllSchedules()
      return c.json(schedules)
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }

  async getById(c: Context) {
    try {
      const id = c.req.param('id')
      const schedule = await this.service.getScheduleById(id)
      return c.json(schedule)
    } catch (error: any) {
      if (error.message === 'Recurring schedule not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 500)
    }
  }

  async create(c: Context) {
    try {
      const dto: CreateRecurringScheduleDto = await c.req.json()
      const schedule = await this.service.createSchedule(dto)
      return c.json(schedule, 201)
    } catch (error: any) {
      return c.json({ error: error.message }, 400)
    }
  }

  async update(c: Context) {
    try {
      const id = c.req.param('id')
      const dto: UpdateRecurringScheduleDto = await c.req.json()
      const schedule = await this.service.updateSchedule(id, dto)
      return c.json(schedule)
    } catch (error: any) {
      if (error.message === 'Recurring schedule not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 400)
    }
  }

  async delete(c: Context) {
    try {
      const id = c.req.param('id')
      await this.service.deleteSchedule(id)
      return c.json({ message: 'Recurring schedule deleted successfully' })
    } catch (error: any) {
      if (error.message === 'Recurring schedule not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 500)
    }
  }
}
