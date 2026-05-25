import { UpdateNavigationSettingsDto, NavigationSettingsResponseDto } from '../dtos/settings.dto'
import { NavigationMenuKey, NavigationMenuVisibility } from '../models/AppSetting'
import { SettingsRepository } from '../repositories/settings.repository'

const NAVIGATION_SETTING_KEY = 'navigation.visible_menus'

const MENU_KEYS: NavigationMenuKey[] = ['dashboard', 'analytics', 'investments', 'recurring', 'budget']

const DEFAULT_MENU_VISIBILITY: NavigationMenuVisibility = {
  dashboard: true,
  analytics: true,
  investments: true,
  recurring: true,
  budget: true
}

export class SettingsService {
  constructor(private settingsRepo: SettingsRepository) {}

  async getNavigationSettings(): Promise<NavigationSettingsResponseDto> {
    const setting = await this.settingsRepo.findByKey(NAVIGATION_SETTING_KEY)

    if (!setting) {
      return {
        visible_menus: DEFAULT_MENU_VISIBILITY,
        updated_at: null
      }
    }

    return {
      visible_menus: this.parseMenuVisibility(setting.value),
      updated_at: setting.updated_at
    }
  }

  async updateNavigationSettings(dto: UpdateNavigationSettingsDto): Promise<NavigationSettingsResponseDto> {
    if (!dto.visible_menus || typeof dto.visible_menus !== 'object') {
      throw new Error('Visible menus are required')
    }

    const current = await this.getNavigationSettings()
    const next = this.mergeMenuVisibility(current.visible_menus, dto.visible_menus)

    if (!Object.values(next).some(Boolean)) {
      throw new Error('At least one menu must be visible')
    }

    const updatedAt = Date.now()
    await this.settingsRepo.upsert(NAVIGATION_SETTING_KEY, JSON.stringify(next), updatedAt)

    return {
      visible_menus: next,
      updated_at: updatedAt
    }
  }

  private parseMenuVisibility(value: string): NavigationMenuVisibility {
    try {
      const parsed = JSON.parse(value) as Partial<NavigationMenuVisibility>
      return this.mergeMenuVisibility(DEFAULT_MENU_VISIBILITY, parsed)
    } catch {
      return DEFAULT_MENU_VISIBILITY
    }
  }

  private mergeMenuVisibility(
    base: NavigationMenuVisibility,
    updates: Partial<NavigationMenuVisibility>
  ): NavigationMenuVisibility {
    const next = { ...base }

    for (const key of MENU_KEYS) {
      if (typeof updates[key] === 'boolean') {
        next[key] = updates[key]
      }
    }

    return next
  }
}
