import { useCallback, useSyncExternalStore } from 'react'

/** Track a CSS media query; false where matchMedia is unavailable (tests, old browsers). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const media = window.matchMedia(query)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [query])
  const getSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
