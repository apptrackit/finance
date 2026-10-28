import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CurrencySettingsCard } from './CurrencySettingsCard'
import { NavigationCard } from './NavigationCard'
import { ScheduledTasksCard } from './ScheduledTasksCard'
import { CacheManagementCard } from './CacheManagementCard'
import { MENU_STORAGE_KEY, STORAGE_KEY } from '../constants'

// Preserve the setup storage stub: cleanup restores Node 26’s unavailable native global.
const browserStorage = localStorage
const showAlert = vi.fn()
let mobile = false
vi.mock('../../../context/AlertContext', () => ({ useAlert: () => ({ showAlert }) }))
vi.mock('../useSettingsMobile', () => ({ useSettingsMobile: () => mobile }))
const menus = { dashboard: true, accounts: true, analytics: true, investments: true, recurring: true }
beforeEach(() => {
  mobile = false
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', browserStorage)
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ visible_menus: menus, updated_at: 1 })))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('only asks to save currency after a change and cancels without persisting', () => {
  render(<CurrencySettingsCard />)
  expect(screen.queryByRole('button', { name: 'Save currency' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'EUR' } })
  expect(screen.getByRole('button', { name: 'Save currency' })).toBeInTheDocument()
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('combobox')).toHaveValue('HUF')
  expect(screen.queryByRole('button', { name: 'Save currency' })).not.toBeInTheDocument()
})

it('preserves a currency draft when browser storage refuses the save', () => {
  render(<CurrencySettingsCard />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'EUR' } })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage unavailable')
    }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save currency' }))
  expect(screen.getByRole('combobox')).toHaveValue('EUR')
  expect(screen.getByRole('button', { name: 'Save currency' })).toBeEnabled()
  expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Currency not saved' }))
})

it('keeps Dashboard available and rolls back an optimistic navigation change on failure', async () => {
  render(<NavigationCard />)
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Toggle Accounts' })).toBeEnabled())
  expect(screen.queryByRole('switch', { name: 'Toggle Dashboard' })).not.toBeInTheDocument()
  expect(screen.getByText('Always shown')).toBeInTheDocument()
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Try again' }, { status: 503 }))
  fireEvent.click(screen.getByRole('switch', { name: 'Toggle Accounts' }))
  expect(screen.getByRole('switch', { name: 'Toggle Accounts' })).toHaveAttribute('aria-checked', 'false')
  await waitFor(() =>
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Navigation not saved' }))
  )
  expect(screen.getByRole('switch', { name: 'Toggle Accounts' })).toHaveAttribute('aria-checked', 'true')
  expect(JSON.parse(localStorage.getItem(MENU_STORAGE_KEY)!)).toEqual(menus)
})

it('runs schedules only after explicit inline confirmation and permits retry on error', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Unavailable' }, { status: 503 }))
  render(<ScheduledTasksCard />)
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
  fireEvent.click(screen.getByRole('button', { name: 'Run task' }))
  await waitFor(() => expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })))
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Run task' })).toBeEnabled()
})

it('presents cache clearing in a mobile sheet and cancel preserves preferences', () => {
  mobile = true
  localStorage.setItem('finance_theme', 'mono')
  render(<CacheManagementCard />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear cache' }))
  const sheet = screen.getByRole('dialog', { name: 'Clear cache and reload?' })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(localStorage.getItem('finance_theme')).toBe('mono')
})
