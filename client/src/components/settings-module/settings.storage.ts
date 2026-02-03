import { STORAGE_KEY } from './constants'

export function getMasterCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || 'HUF'
}
