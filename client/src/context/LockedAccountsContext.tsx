import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

type LockedAccountsContextType = {
  lockedAccounts: Set<string>
  isLocked: (accountId: string) => boolean
  lockAccount: (accountId: string) => void
  unlockAccount: (accountId: string) => void
}

const LockedAccountsContext = createContext<LockedAccountsContextType | undefined>(undefined)

const STORAGE_KEY = 'finance_locked_accounts'

export function LockedAccountsProvider({ children }: { children: ReactNode }) {
  const [lockedAccounts, setLockedAccounts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return new Set(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load locked accounts from localStorage:', error)
    }
    return new Set()
  })

  // Persist to localStorage whenever lockedAccounts changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(lockedAccounts)))
    } catch (error) {
      console.error('Failed to save locked accounts to localStorage:', error)
    }
  }, [lockedAccounts])

  const isLocked = (accountId: string): boolean => {
    return lockedAccounts.has(accountId)
  }

  const lockAccount = (accountId: string) => {
    setLockedAccounts(prev => new Set(prev).add(accountId))
  }

  const unlockAccount = (accountId: string) => {
    setLockedAccounts(prev => {
      const newSet = new Set(prev)
      newSet.delete(accountId)
      return newSet
    })
  }

  return (
    <LockedAccountsContext.Provider value={{ lockedAccounts, isLocked, lockAccount, unlockAccount }}>
      {children}
    </LockedAccountsContext.Provider>
  )
}

export function useLockedAccounts() {
  const context = useContext(LockedAccountsContext)
  if (context === undefined) {
    throw new Error('useLockedAccounts must be used within a LockedAccountsProvider')
  }
  return context
}
