import { NavigationMenuVisibility } from '../models/AppSetting'

export interface UpdateNavigationSettingsDto {
  visible_menus: Partial<NavigationMenuVisibility>
}

export interface NavigationSettingsResponseDto {
  visible_menus: NavigationMenuVisibility
  updated_at: number | null
}
