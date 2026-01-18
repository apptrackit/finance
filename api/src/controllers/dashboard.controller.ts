import { Context } from 'hono'
import { DashboardService } from '../services/dashboard.service'

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  async getNetWorth(c: Context) {
    const currency = c.req.query('currency') || 'HUF'
    const result = await this.dashboardService.getNetWorth(currency)
    return c.json(result)
  }

  async getSpendingEstimate(c: Context) {
    const period = c.req.query('period') as 'week' | 'month' || 'month'
    const currency = c.req.query('currency') || 'HUF'
    const categoryId = c.req.query('categoryId')
    const includeRecurring = c.req.query('includeRecurring') !== 'false'

    if (period !== 'week' && period !== 'month') {
      return c.json({ error: 'Invalid period. Must be "week" or "month"' }, 400)
    }

    const result = await this.dashboardService.getSpendingEstimate(
      period,
      currency,
      categoryId,
      includeRecurring
    )
    return c.json(result)
  }
}
