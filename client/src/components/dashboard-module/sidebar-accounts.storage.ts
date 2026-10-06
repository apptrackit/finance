export const SIDEBAR_ACCOUNTS_STORAGE_KEY = 'finance_sidebar_accounts'
export type SidebarAccountGroup = 'cash' | 'investment'
export type SidebarAccountPreferences = Record<SidebarAccountGroup, { collapsed: boolean }>

export function readSidebarAccountPreferences(): SidebarAccountPreferences {
  const defaults: SidebarAccountPreferences = {
    cash: { collapsed: false },
    investment: { collapsed: false },
  }
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SIDEBAR_ACCOUNTS_STORAGE_KEY) || 'null')
    if (!value || typeof value !== 'object') return defaults
    for (const group of ['cash', 'investment'] as const) {
      const saved = (value as Record<string, unknown>)[group]
      if (!saved || typeof saved !== 'object') continue
      const flags = saved as Record<string, unknown>
      if (typeof flags.collapsed === 'boolean') defaults[group].collapsed = flags.collapsed
    }
  } catch { /* Invalid or unavailable storage uses the expanded defaults. */ }
  return defaults
}

export function saveSidebarAccountPreferences(preferences: SidebarAccountPreferences): void {
  try { localStorage.setItem(SIDEBAR_ACCOUNTS_STORAGE_KEY, JSON.stringify(preferences)) }
  catch { /* Storage failure must not prevent account navigation. */ }
}
