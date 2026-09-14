import { createContext, useContext, useState, type ReactNode } from 'react'

const setCookie = (name: string, value: string, days: number = 365) => {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`
}

const getCookie = (name: string): string | null => {
  const nameEQ = `${name}=`
  for (let cookie of document.cookie.split(';')) {
    cookie = cookie.trim()
    if (cookie.indexOf(nameEQ) === 0) return cookie.substring(nameEQ.length)
  }
  return null
}

const PRIVACY_DEFAULT_KEY = 'finance_privacy_default'
const PRIVACY_INVESTMENTS_KEY = 'finance_privacy_investments'
const PRIVACY_STARTUP_KEY = 'finance_privacy_startup'

type PrivacyMode = 'visible' | 'hidden'
export type PrivacyStartupMode = 'none' | 'all' | 'networth'

const getStartupPrivacyMode = (): PrivacyStartupMode => {
  const saved = getCookie(PRIVACY_STARTUP_KEY) || localStorage.getItem(PRIVACY_STARTUP_KEY)
  if (saved === 'none' || saved === 'all' || saved === 'networth') return saved

  // Migrate the previous pair of switches to the closest new preference.
  const legacyDefault = getCookie(PRIVACY_DEFAULT_KEY) || localStorage.getItem(PRIVACY_DEFAULT_KEY)
  const legacyInvestments = getCookie(PRIVACY_INVESTMENTS_KEY) || localStorage.getItem(PRIVACY_INVESTMENTS_KEY)
  if (legacyDefault === 'hidden') return 'all'
  if (legacyInvestments === 'hidden') return 'networth'
  return 'none'
}

interface PrivacyContextType {
  privacyMode: PrivacyMode
  privacyStartupMode: PrivacyStartupMode
  togglePrivacyMode: () => void
  setPrivacyMode: (mode: PrivacyMode) => void
  setPrivacyStartupMode: (mode: PrivacyStartupMode) => void
  maskValue: (value: string | number, type?: 'currency' | 'text') => string
  shouldHideInvestment: () => boolean
  shouldHideNetWorth: () => boolean
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacyStartupMode, setPrivacyStartupModeState] = useState<PrivacyStartupMode>(getStartupPrivacyMode)
  const [privacyMode, setPrivacyModeState] = useState<PrivacyMode>(() => (
    getStartupPrivacyMode() === 'all' ? 'hidden' : 'visible'
  ))

  const setPrivacyStartupMode = (mode: PrivacyStartupMode) => {
    setPrivacyStartupModeState(mode)
    setCookie(PRIVACY_STARTUP_KEY, mode)
    localStorage.setItem(PRIVACY_STARTUP_KEY, mode)
    setPrivacyModeState(mode === 'all' ? 'hidden' : 'visible')
  }

  const togglePrivacyMode = () => {
    setPrivacyModeState(previous => previous === 'visible' ? 'hidden' : 'visible')
  }

  const setPrivacyMode = (mode: PrivacyMode) => {
    setPrivacyModeState(mode)
  }

  const shouldHideInvestment = () => privacyMode === 'hidden'
  const shouldHideNetWorth = () => privacyMode === 'hidden' || privacyStartupMode === 'networth'

  const maskValue = (value: string | number, type: 'currency' | 'text' = 'currency'): string => {
    if (privacyMode === 'visible') return String(value)
    if (type === 'currency') return '••••••'

    const stringValue = String(value)
    return stringValue.length <= 3 ? '•••' : '•'.repeat(Math.min(stringValue.length, 8))
  }

  return (
    <PrivacyContext.Provider value={{
      privacyMode,
      privacyStartupMode,
      togglePrivacyMode,
      setPrivacyMode,
      setPrivacyStartupMode,
      maskValue,
      shouldHideInvestment,
      shouldHideNetWorth,
    }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const context = useContext(PrivacyContext)
  if (context === undefined) throw new Error('usePrivacy must be used within a PrivacyProvider')
  return context
}

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
