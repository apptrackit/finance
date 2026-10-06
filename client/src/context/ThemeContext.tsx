import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ColorMode = 'dark' | 'light'
export type ThemeId = 'emerald' | 'mono' | 'redfilter'

export interface Theme {
  id: ThemeId
  name: string
  description: string
  primaryColor: string
  bgColor: string
  cardColor: string
  /** CSS filter applied to the whole page via the html element */
  cssFilter?: string
}

export const THEMES: Theme[] = [
  {
    id: 'emerald',
    name: 'Original',
    description: 'Default finance theme with blue accents',
    primaryColor: '#5189D8',
    bgColor: '#000610',
    cardColor: '#010E21',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Pure black, white & gray — zero color',
    primaryColor: '#5189D8',
    bgColor: '#000610',
    cardColor: '#010E21',
    cssFilter: 'grayscale(1)',
  },
  {
    id: 'redfilter',
    name: 'Red Filter',
    description: 'Blue-light blocking — all hues shifted to red',
    primaryColor: '#5189D8',
    bgColor: '#000610',
    cardColor: '#010E21',
    cssFilter: 'sepia(1) saturate(6) hue-rotate(315deg) brightness(0.75)',
  },
]

const THEME_STORAGE_KEY = 'finance_theme'

interface ThemeContextType {
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => localStorage.getItem('finance_color_mode') === 'light' ? 'light' : 'dark')
  const setColorMode = (mode: ColorMode) => {
    setColorModeState(mode)
    localStorage.setItem('finance_color_mode', mode)
  }
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

    // Apply CSS filter for filter-based themes
    const activeTheme = THEMES.find(t => t.id === theme)
    html.style.setProperty('--app-color-filter', activeTheme?.cssFilter || 'none')
  }, [theme])

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorMode, setColorMode }}>
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
