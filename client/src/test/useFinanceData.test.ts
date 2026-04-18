import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFinanceData } from '../hooks/useFinanceData'

// Mock apiFetch and config
vi.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:8787',
  apiFetch: vi.fn(),
}))

vi.mock('../components/settings-module/Settings', () => ({
  getMasterCurrency: () => 'HUF',
}))

import { apiFetch } from '../config'

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>

const mockAccount = {
  id: 'acc-1',
  name: 'Test Account',
  type: 'cash',
  balance: 100000,
  currency: 'HUF',
  updated_at: Date.now(),
}

const mockTransaction = {
  id: 'tx-1',
  account_id: 'acc-1',
  amount: -5000,
  date: '2026-04-01',
  category_id: 'cat-1',
}

const dateRange = { startDate: '2026-04-01', endDate: '2026-04-30' }

beforeEach(() => {
  vi.clearAllMocks()
  // Mock fetch (used for exchange rates)
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ rates: { USD: 0.0026, EUR: 0.0025 } }),
  }) as any
})

describe('useFinanceData', () => {
  it('returns initial empty state', () => {
    mockApiFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    })

    const { result } = renderHook(() => useFinanceData(dateRange, 'HUF'))

    expect(result.current.accounts).toEqual([])
    expect(result.current.transactions).toEqual([])
    expect(result.current.transactionsLoading).toBe(true)
  })

  it('fetches and sets accounts', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/accounts')) {
        return Promise.resolve({ json: () => Promise.resolve([mockAccount]) })
      }
      if (url.includes('/transactions/date-range')) {
        return Promise.resolve({ json: () => Promise.resolve([mockTransaction]) })
      }
      if (url.includes('/dashboard/net-worth')) {
        return Promise.resolve({ json: () => Promise.resolve({ net_worth: 100000 }) })
      }
      if (url.includes('/categories')) {
        return Promise.resolve({ json: () => Promise.resolve([]) })
      }
      if (url.includes('/version')) {
        return Promise.resolve({ json: () => Promise.resolve({ version: '1.0.0' }) })
      }
      return Promise.resolve({ json: () => Promise.resolve([]) })
    })

    const { result } = renderHook(() => useFinanceData(dateRange, 'HUF'))

    await waitFor(() => {
      expect(result.current.transactionsLoading).toBe(false)
    })

    expect(result.current.accounts).toHaveLength(1)
    expect(result.current.accounts[0].name).toBe('Test Account')
  })

  it('exposes handleDataChange callback', () => {
    mockApiFetch.mockResolvedValue({ json: () => Promise.resolve([]) })

    const { result } = renderHook(() => useFinanceData(dateRange, 'HUF'))

    expect(typeof result.current.handleDataChange).toBe('function')
  })
})
