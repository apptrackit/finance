import { useSyncExternalStore } from 'react'

const query = '(max-width: 1023px)'
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getSnapshot = () => window.matchMedia(query).matches
export const useSettingsMobile = () => useSyncExternalStore(subscribe, getSnapshot)
