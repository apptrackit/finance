import { API_BASE_URL, apiFetch } from '../../config'
import { DEFAULT_MENU_VISIBILITY, MENU_STORAGE_KEY, STORAGE_KEY, type MenuKey } from './constants'

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}

type NavigationSettingsResponse = {
  visible_menus: Partial<Record<MenuKey, boolean>>
  updated_at: number | null
}

const MENU_KEYS: MenuKey[] = ['dashboard', 'analytics', 'investments', 'recurring', 'budget']

export function normalizeMenuVisibility(
  value?: Partial<Record<MenuKey, boolean>> | null
): Record<MenuKey, boolean> {
  const next = { ...DEFAULT_MENU_VISIBILITY }

  if (!value || typeof value !== 'object') {
    return next
  }

  for (const key of MENU_KEYS) {
    if (typeof value[key] === 'boolean') {
      next[key] = value[key]
    }
  }

  return next
}

export function getStoredMenuVisibility(): Record<MenuKey, boolean> {
  return getStoredMenuVisibilityOrNull() || normalizeMenuVisibility()
}

export function storeMenuVisibility(visibleMenus: Record<MenuKey, boolean>) {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(normalizeMenuVisibility(visibleMenus)))
}

export async function loadNavigationSettings(): Promise<Record<MenuKey, boolean>> {
  const storedMenus = getStoredMenuVisibilityOrNull()

  try {
    const response = await apiFetch(`${API_BASE_URL}/settings/navigation`)
    if (!response.ok) {
      throw new Error('Failed to load navigation settings')
    }

    const data = await response.json() as NavigationSettingsResponse

    if (data.updated_at === null && storedMenus) {
      return await saveNavigationSettings(storedMenus)
    }

    const visibleMenus = normalizeMenuVisibility(data.visible_menus)
    storeMenuVisibility(visibleMenus)
    return visibleMenus
  } catch (error) {
    console.error('Failed to load navigation settings:', error)
    return storedMenus || normalizeMenuVisibility()
  }
}

export async function saveNavigationSettings(
  visibleMenus: Record<MenuKey, boolean>
): Promise<Record<MenuKey, boolean>> {
  const normalizedMenus = normalizeMenuVisibility(visibleMenus)
  const response = await apiFetch(`${API_BASE_URL}/settings/navigation`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ visible_menus: normalizedMenus })
  })

  if (!response.ok) {
    let message = 'Failed to save navigation settings'
    try {
      const data = await response.json() as { error?: string }
      message = data.error || message
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new Error(message)
  }

  const data = await response.json() as NavigationSettingsResponse
  const savedMenus = normalizeMenuVisibility(data.visible_menus)
  storeMenuVisibility(savedMenus)
  return savedMenus
}

function getStoredMenuVisibilityOrNull(): Record<MenuKey, boolean> | null {
  const stored = localStorage.getItem(MENU_STORAGE_KEY)
  if (!stored) {
    return null
  }

  try {
    return normalizeMenuVisibility(JSON.parse(stored) as Partial<Record<MenuKey, boolean>>)
  } catch (error) {
    console.error('Failed to parse menu visibility settings:', error)
    return null
  }
}
