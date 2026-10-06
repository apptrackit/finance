import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router'
import { useAlert } from '../context/AlertContext'

const UnsavedContext = createContext<((id: string, dirty: boolean) => void) | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Set<string>>(() => new Set())
  const register = useCallback((id: string, dirty: boolean) => {
    setSources(previous => {
      if (previous.has(id) === dirty) return previous
      const next = new Set(previous)
      if (dirty) next.add(id); else next.delete(id)
      return next
    })
  }, [])
  const dirty = sources.size > 0
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  const { confirm } = useAlert()
  const asking = useRef(false)
  const currentBlocker = useRef(blocker)
  useEffect(() => { currentBlocker.current = blocker }, [blocker])

  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (dirty) { event.preventDefault(); event.returnValue = '' }
  }, [dirty]))

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirm({ title: 'Leave unfinished changes?', message: 'Your unsaved changes will be lost.',
      confirmText: 'Leave page', cancelText: 'Keep editing' }).then(leave => {
      asking.current = false
      const latest = currentBlocker.current
      if (latest.state === 'blocked') {
        if (leave) latest.proceed(); else latest.reset()
      }
    })
  }, [blocker, confirm])

  return <UnsavedContext.Provider value={register}>{children}</UnsavedContext.Provider>
}

// Active financial editors are protected, including while a save is in flight.
// Registering open editors also covers initial values populated asynchronously.
export function useUnsavedChanges(active: boolean) {
  const register = useContext(UnsavedContext)
  const id = useId()
  useEffect(() => {
    register?.(id, active)
    return () => register?.(id, false)
  }, [register, id, active])
}
