import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeId = 'emerald' | 'ocean' | 'sunset' | 'violet'

export interface Theme {
  id: ThemeId
  name: string
  description: string
  primaryColor: string
  bgColor: string
  cardColor: string
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
    THEMES.forEach(t => html.classList.remove(`theme-${t.id}`))
    if (theme !== 'emerald') {
      html.classList.add(`theme-${theme}`)
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
