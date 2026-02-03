import { Context } from 'hono'
import { BudgetService } from '../services/budget.service'
import { CreateBudgetDto, UpdateBudgetDto } from '../dtos/budget.dto'

export class BudgetController {
  constructor(private service: BudgetService) {}

  async getAll(c: Context) {
    try {
      const budgets = await this.service.getAllBudgets()
      return c.json(budgets)
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }

  async getById(c: Context) {
    try {
      const id = c.req.param('id')
      const budget = await this.service.getBudgetById(id)
      return c.json(budget)
    } catch (error: any) {
      if (error.message === 'Budget not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 500)
    }
  }

  async create(c: Context) {
    try {
      const dto: CreateBudgetDto = await c.req.json()
      const budget = await this.service.createBudget(dto)
      return c.json(budget, 201)
    } catch (error: any) {
      return c.json({ error: error.message }, 400)
    }
  }

  async update(c: Context) {
    try {
      const id = c.req.param('id')
      const dto: UpdateBudgetDto = await c.req.json()
      const budget = await this.service.updateBudget(id, dto)
      return c.json(budget)
    } catch (error: any) {
      if (error.message === 'Budget not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 400)
    }
  }

  async delete(c: Context) {
    try {
      const id = c.req.param('id')
      await this.service.deleteBudget(id)
      return c.json({ message: 'Budget deleted successfully' })
    } catch (error: any) {
      if (error.message === 'Budget not found') {
        return c.json({ error: error.message }, 404)
      }
      return c.json({ error: error.message }, 500)
    }
  }
}
