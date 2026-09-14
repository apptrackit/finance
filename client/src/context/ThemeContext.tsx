import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeId = 'emerald' | 'ocean' | 'sunset' | 'violet' | 'mono' | 'redfilter'

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
    name: 'Blue',
    description: 'Default dark theme with blue accents',
    primaryColor: '#5189D8',
    bgColor: '#000610',
    cardColor: '#010E21',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep navy with cyan highlights',
    primaryColor: '#06b6d4',
    bgColor: '#000610',
    cardColor: '#010E21',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm dark tones with amber glow',
    primaryColor: '#f97316',
    bgColor: '#000610',
    cardColor: '#010E21',
  },
  {
    id: 'violet',
    name: 'Violet',
    description: 'Dark purple atmosphere with violet accents',
    primaryColor: '#8b5cf6',
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
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return (saved as ThemeId) || 'emerald'
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
    if (activeTheme?.cssFilter) {
      html.style.filter = activeTheme.cssFilter
    }
  }, [theme])

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
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
