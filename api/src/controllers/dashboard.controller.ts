import { Context } from 'hono'
import { DashboardService } from '../services/dashboard.service'

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  async getNetWorth(c: Context) {
    const currency = c.req.query('currency') || 'HUF'
    const result = await this.dashboardService.getNetWorth(currency)
    return c.json(result)
  }
}
