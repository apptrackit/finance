export interface AppSetting {
  key: string
  value: string
  updated_at: number
}

export type NavigationMenuKey = 'dashboard' | 'analytics' | 'investments' | 'recurring' | 'budget'

export type NavigationMenuVisibility = Record<NavigationMenuKey, boolean>
