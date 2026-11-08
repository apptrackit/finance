import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ColorMode = 'dark' | 'light'
/** What the person chose; 'system' follows the device appearance. */
export type ColorModePreference = ColorMode | 'system'
export type ThemeId = 'emerald' | 'mono' | 'redfilter'

type ThemePreview = {
  primaryColor: string
  bgColor: string
  cardColor: string
  foregroundColor: string
  primaryForegroundColor: string
}

export interface Theme extends ThemePreview {
  id: ThemeId
  name: string
  description: string
  lightPreview: ThemePreview
}

export const THEMES: Theme[] = [
  {
    id: 'emerald',
    name: 'Original',
    description: 'Default finance theme with blue accents',
    primaryColor: '#5189D8',
    bgColor: '#000610',
    cardColor: '#010E21',
    foregroundColor: '#f8fafc',
    primaryForegroundColor: '#ffffff',
    lightPreview: { primaryColor: '#3b70bf', bgColor: '#f4f6fa', cardColor: '#ffffff', foregroundColor: '#0b1c32', primaryForegroundColor: '#ffffff' },
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Neutral surfaces with meaningful color accents',
    primaryColor: '#ebebeb',
    bgColor: '#0a0a0a',
    cardColor: '#181818',
    foregroundColor: '#f5f5f5',
    primaryForegroundColor: '#171717',
    lightPreview: { primaryColor: '#1f1f1f', bgColor: '#f7f7f7', cardColor: '#ffffff', foregroundColor: '#171717', primaryForegroundColor: '#ffffff' },
  },
  {
    id: 'redfilter',
    name: 'Red Filter',
    description: 'Red surfaces with meaningful color accents',
    primaryColor: '#ff7575',
    bgColor: '#110707',
    cardColor: '#231010',
    foregroundColor: '#ffe6e6',
    primaryForegroundColor: '#280a0a',
    lightPreview: { primaryColor: '#b91c1c', bgColor: '#fff5f5', cardColor: '#fffafa', foregroundColor: '#3b1414', primaryForegroundColor: '#fffafa' },
  },
]

const THEME_STORAGE_KEY = 'finance_theme'
const COLOR_MODE_STORAGE_KEY = 'finance_color_mode'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readSavedPreference(): ColorModePreference {
  try {
    const saved = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function readSystemMode(): ColorMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

interface ThemeContextType {
  /** The appearance currently shown, after resolving 'system'. */
  colorMode: ColorMode
  colorModePreference: ColorModePreference
  setColorMode: (mode: ColorModePreference) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorModePreference, setPreferenceState] = useState<ColorModePreference>(readSavedPreference)
  const [systemMode, setSystemMode] = useState<ColorMode>(readSystemMode)
  const colorMode: ColorMode = colorModePreference === 'system' ? systemMode : colorModePreference
  const setColorMode = (mode: ColorModePreference) => {
    setPreferenceState(mode)
    try {
      if (mode === 'system') localStorage.removeItem(COLOR_MODE_STORAGE_KEY)
      else localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode)
    } catch { /* Storage can be unavailable; the choice still applies for this session. */ }
  }
  useEffect(() => {
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
    if (!query) return
    const update = () => setSystemMode(query.matches ? 'dark' : 'light')
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.style.colorScheme = colorMode
  }, [colorMode])
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return THEMES.some(t => t.id === saved) ? saved as ThemeId : 'emerald'
  })

  useEffect(() => {
    const html = document.documentElement
    // Remove all theme classes
    THEMES.forEach(t => html.classList.remove(`theme-${t.id}`))
    // Remove any previously applied filter
    html.style.removeProperty('filter')

    if (theme !== 'emerald') {
      html.classList.add(`theme-${theme}`)
    }

    // Clear legacy page filters when restoring saved Monochrome/Red Filter preferences.
    html.style.setProperty('--app-color-filter', 'none')
  }, [theme])

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorMode, colorModePreference, setColorMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
