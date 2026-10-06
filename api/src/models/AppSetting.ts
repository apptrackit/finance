export interface AppSetting {
  key: string
  value: string
  updated_at: number
}

export type NavigationMenuKey = 'dashboard' | 'accounts' | 'analytics' | 'investments' | 'recurring'

export type NavigationMenuVisibility = Record<NavigationMenuKey, boolean>
