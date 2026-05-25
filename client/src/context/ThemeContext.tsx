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
    name: 'Emerald',
    description: 'Default dark theme with green accents',
    primaryColor: '#22c55e',
    bgColor: '#0b0f1a',
    cardColor: '#0e1420',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep navy with cyan highlights',
    primaryColor: '#06b6d4',
    bgColor: '#08101e',
    cardColor: '#0b1425',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm dark tones with amber glow',
    primaryColor: '#f97316',
    bgColor: '#120b07',
    cardColor: '#170e09',
  },
  {
    id: 'violet',
    name: 'Violet',
    description: 'Dark purple atmosphere with violet accents',
    primaryColor: '#8b5cf6',
    bgColor: '#0c0a14',
    cardColor: '#0f0d1a',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Pure black, white & gray — zero color',
    primaryColor: '#22c55e',
    bgColor: '#0b0f1a',
    cardColor: '#0e1420',
    cssFilter: 'grayscale(1)',
  },
  {
    id: 'redfilter',
    name: 'Red Filter',
    description: 'Blue-light blocking — all hues shifted to red',
    primaryColor: '#22c55e',
    bgColor: '#0b0f1a',
    cardColor: '#0e1420',
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
