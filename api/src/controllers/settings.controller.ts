import { Context } from 'hono'
import { SettingsService } from '../services/settings.service'
import { UpdateNavigationSettingsDto } from '../dtos/settings.dto'

export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  async getNavigation(c: Context) {
    try {
      const settings = await this.settingsService.getNavigationSettings()
      return c.json(settings)
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }

  async updateNavigation(c: Context) {
    try {
      const body = await c.req.json<UpdateNavigationSettingsDto>()
      const settings = await this.settingsService.updateNavigationSettings(body)
      return c.json(settings)
    } catch (error: any) {
      return c.json({ error: error.message }, 400)
    }
  }
}
