import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExportCard } from './DataExportCard'
import { BROWSER_SETTING_KEYS, createCSVExport, createJSONExport } from '../data-export'
import { EXPORT_EXCLUSIONS, EXPORT_TABLES, type DataExport } from '../../../../../shared/data-export'

const NativeURL = URL
const showAlert = vi.fn()
vi.mock('../../../context/AlertContext', () => ({ useAlert: () => ({ showAlert }) }))

function fixture(): DataExport {
  const data = Object.fromEntries(EXPORT_TABLES.map(table => [table, []])) as DataExport['data']
  data.accounts = [{ id: 'cash', name: 'Test cash', currency: 'HUF' }, { id: 'savings', name: 'Test savings', currency: 'EUR' }]
  data.categories = [{ id: 'food', name: 'Test food' }]
  data.transactions = [
    { id: 'posted', account_id: 'cash', category_id: 'food', amount: -10, date: '2026-01-01', status: 'posted', description: 'Test, "quoted"\rdescription', exclude_from_estimate: 1 },
    { id: 'out', account_id: 'cash', amount: -4000, date: '2026-01-01', status: 'posted', linked_transaction_id: 'in' },
    { id: 'in', account_id: 'savings', amount: 10, date: '2026-01-01', status: 'posted', linked_transaction_id: 'out' },
    { id: 'pending', status: 'pending', pending_kind: 'upcoming' },
    { id: 'review', status: 'pending', pending_kind: 'mcp_review', review_source: 'chatgpt_mcp' },
    { id: 'cancelled', status: 'cancelled' },
  ]
  data.investment_transactions = [{ id: 'buy', quantity: 0.125, price: 100 }]
  data.recurring_schedules = [{ id: 'schedule', month: 11 }]
  data.app_settings = [{ key: 'navigation.visible_menus', value: '{"dashboard":true}', updated_at: 1 }]
  return {
    format: 'finance-manager-data-export', exportVersion: 1, schemaVersion: '015-yearly-recurring-month',
    migrations: ['015-yearly-recurring-month'], exportedAt: '2026-10-01T00:00:00.000Z', data,
    manifest: { tables: Object.fromEntries(EXPORT_TABLES.map(table => [table, { rowCount: data[table].length }])) as DataExport['manifest']['tables'], excluded: EXPORT_EXCLUSIONS, restoreSupported: false },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.cookie = 'finance_privacy_startup=;max-age=0;path=/'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(fixture())))
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:test')
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('keeps all database rows and allowlisted browser preferences while excluding secrets', async () => {
  BROWSER_SETTING_KEYS.forEach(key => localStorage.setItem(key, `saved-${key}`))
  localStorage.setItem('API_SECRET', 'synthetic-sensitive-value')
  localStorage.setItem('finance_unknown_token', 'synthetic-sensitive-value')
  document.cookie = 'finance_privacy_startup=networth;path=/'
  document.cookie = 'auth_token=synthetic-sensitive-value;path=/'
  const data = JSON.parse(await createJSONExport())
  expect(data.data).toEqual(fixture().data)
  expect(Object.keys(data.browserSettings)).toEqual([...BROWSER_SETTING_KEYS])
  expect(data.browserSettings.finance_privacy_startup).toBe('networth')
  expect(data.browserSettings.finance_theme).toBe('saved-finance_theme')
  expect(JSON.stringify(data)).not.toContain('synthetic-sensitive-value')
  expect(fetch).toHaveBeenCalledWith('/api/export', expect.anything())
})

it('limits CSV to posted cash ledger rows, preserving transfer links, native currencies and escaping', async () => {
  const csv = await createCSVExport()
  expect(csv).toContain('Linked Transaction ID')
  expect(csv).toContain('2026-01-01,out,cash,Test cash,HUF,,,Transfer,-4000,,in,No')
  expect(csv).toContain('2026-01-01,in,savings,Test savings,EUR,,,Transfer,10,,out,No')
  expect(csv).toContain('"Test, ""quoted""\rdescription"')
  for (const id of ['pending', 'review', 'cancelled', 'buy']) expect(csv).not.toContain(id)
})

it('downloads JSON only after the complete export succeeds and releases the download URL', async () => {
  render(<DataExportCard />)
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce())
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  expect(showAlert).not.toHaveBeenCalled()
  expect(screen.getByText(/Import and restore are not supported/)).toBeInTheDocument()
})

describe.each(['CSV', 'JSON'])('%s failure handling', format => {
  it.each(['http', 'missing table', 'count mismatch', 'version', 'invalid json', 'network'])('blocks download for %s and allows retry', async failure => {
    const data = fixture()
    if (failure === 'missing table') Reflect.deleteProperty(data.data, 'investment_transactions')
    if (failure === 'count mismatch') data.manifest.tables.transactions.rowCount++
    if (failure === 'version') Reflect.set(data, 'exportVersion', 99)
    const response = failure === 'http' ? Response.json({ error: 'Database temporarily unavailable' }, { status: 503 })
      : failure === 'invalid json' ? new Response('{broken') : Response.json(data)
    if (failure === 'network') vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection lost'))
    else vi.mocked(fetch).mockResolvedValueOnce(response)
    render(<DataExportCard />)
    fireEvent.click(screen.getByRole('button', { name: format }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export Failed', type: 'error' })))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: format })).toBeEnabled()
    if (failure === 'http') expect(showAlert.mock.calls[0][0].message).toBe('Database temporarily unavailable')
  })
})

it('disables both buttons until the read completes, including empty exports', async () => {
  const data = fixture()
  EXPORT_TABLES.forEach(table => { data.data[table] = []; data.manifest.tables[table].rowCount = 0 })
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  render(<DataExportCard />)
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(screen.getAllByRole('button', { name: 'Exporting...' })).toHaveLength(2)
  expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true)
  await act(async () => { resolve(Response.json(data)) })
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled()
})
