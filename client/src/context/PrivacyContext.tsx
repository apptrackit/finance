import { createContext, useContext, useState, type ReactNode } from 'react'

// Cookie helper functions
const setCookie = (name: string, value: string, days: number = 365) => {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`
}

const getCookie = (name: string): string | null => {
  const nameEQ = `${name}=`
  const ca = document.cookie.split(';')
  for (let c of ca) {
    c = c.trim()
    if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length)
    }
  }
  return null
}

// Storage keys
const PRIVACY_DEFAULT_KEY = 'finance_privacy_default'

type PrivacyMode = 'visible' | 'hidden'

interface PrivacyContextType {
  privacyMode: PrivacyMode
  togglePrivacyMode: () => void
  setPrivacyMode: (mode: PrivacyMode) => void
  defaultPrivacyMode: PrivacyMode
  setDefaultPrivacyMode: (mode: PrivacyMode) => void
  maskValue: (value: string | number, type?: 'currency' | 'text') => string
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Load default from cookie/localStorage, then apply it as initial state
  const [defaultPrivacyMode, setDefaultPrivacyModeState] = useState<PrivacyMode>(() => {
    const savedDefault = getCookie(PRIVACY_DEFAULT_KEY) || localStorage.getItem(PRIVACY_DEFAULT_KEY)
    return (savedDefault as PrivacyMode) || 'visible'
  })

  const [privacyMode, setPrivacyModeState] = useState<PrivacyMode>(() => {
    // On initial load, use the default privacy mode setting
    const savedDefault = getCookie(PRIVACY_DEFAULT_KEY) || localStorage.getItem(PRIVACY_DEFAULT_KEY)
    return (savedDefault as PrivacyMode) || 'visible'
  })

  // Save default privacy mode to both cookie and localStorage
  const setDefaultPrivacyMode = (mode: PrivacyMode) => {
    setDefaultPrivacyModeState(mode)
    setCookie(PRIVACY_DEFAULT_KEY, mode)
    localStorage.setItem(PRIVACY_DEFAULT_KEY, mode)
  }

  // Toggle current session's privacy mode
  const togglePrivacyMode = () => {
    setPrivacyModeState(prev => prev === 'visible' ? 'hidden' : 'visible')
  }

  const setPrivacyMode = (mode: PrivacyMode) => {
    setPrivacyModeState(mode)
  }

  // Mask sensitive values
  const maskValue = (value: string | number, type: 'currency' | 'text' = 'currency'): string => {
    if (privacyMode === 'visible') {
      return String(value)
    }
    
    if (type === 'currency') {
      return '••••••'
    }
    
    // For text, preserve length somewhat
    const strValue = String(value)
    if (strValue.length <= 3) {
      return '•••'
    }
    return '•'.repeat(Math.min(strValue.length, 8))
  }

  return (
    <PrivacyContext.Provider 
      value={{ 
        privacyMode, 
        togglePrivacyMode, 
        setPrivacyMode,
        defaultPrivacyMode,
        setDefaultPrivacyMode,
        maskValue 
      }}
    >
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const context = useContext(PrivacyContext)
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider')
  }
  return context
}

// Helper component for displaying masked/unmasked values
interface PrivateValueProps {
  value: string | number
  type?: 'currency' | 'text'
  className?: string
}

export function PrivateValue({ value, type = 'currency', className = '' }: PrivateValueProps) {
  const { maskValue, privacyMode } = usePrivacy()
  
  return (
    <span className={`${className} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
      {maskValue(value, type)}
    </span>
  )
}
