import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Node 26 exposes an unavailable global localStorage that can shadow jsdom's.
const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  get length() { return stored.size },
  clear() { stored.clear() },
  getItem(key: string) { return stored.get(key) ?? null },
  key(index: number) { return [...stored.keys()][index] ?? null },
  removeItem(key: string) { stored.delete(key) },
  setItem(key: string, value: string) { stored.set(key, String(value)) },
} satisfies Storage)
