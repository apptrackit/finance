import { API_BASE_URL, apiFetch } from '../../config'
import { isDataExport, MAX_EXPORT_BYTES, type ExportRow } from '../../../../shared/data-export'

// Export only known app preferences, never arbitrary storage or auth cookies.
export const BROWSER_SETTING_KEYS = [
  'finance_master_currency', 'finance_visible_menus', 'finance_theme', 'finance_color_mode',
  'finance_privacy_startup', 'finance_privacy_default', 'finance_privacy_investments',
  'analytics-widget-visibility',
  'finance_last_expense_account', 'finance_last_expense_category',
  'finance_last_income_account', 'finance_last_income_category',
  'finance_last_transfer_from', 'finance_last_transfer_to',
] as const

function readBrowserSettings(): Record<string, string | null> {
  const cookies = new Map(document.cookie.split(';').map(cookie => {
    const separator = cookie.indexOf('=')
    return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1)]
  }))
  return Object.fromEntries(BROWSER_SETTING_KEYS.map(key => [key,
    (key.startsWith('finance_privacy_') ? cookies.get(key) : undefined) || localStorage.getItem(key),
  ]))
}

export async function loadDataExport() {
  const response = await apiFetch(`${API_BASE_URL}/export`, { throwOnError: true })
  const data: unknown = await response.json()
  if (!isDataExport(data)) {
    throw new Error('The export response is incomplete or uses an unsupported format. Refresh the app and retry.')
  }
  return data
}

export async function createJSONExport(): Promise<string> {
  const data = await loadDataExport()
  const json = JSON.stringify({ ...data, browserSettings: readBrowserSettings() }, null, 2)
  if (new TextEncoder().encode(json).byteLength > MAX_EXPORT_BYTES) {
    throw new Error('The data export exceeds 16 MiB. Use a D1 database export for larger datasets.')
  }
  return json
}

const escapeCSV = (field: string) => /[,"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
const field = (row: ExportRow | undefined, key: string) => String(row?.[key] ?? '')

export async function createCSVExport(): Promise<string> {
  const { data } = await loadDataExport()
  const accounts = new Map(data.accounts.map(account => [account.id, account]))
  const categories = new Map(data.categories.map(category => [category.id, category]))
  const headers = ['Date', 'Transaction ID', 'Account ID', 'Account', 'Account Currency',
    'Category ID', 'Category', 'Type', 'Amount', 'Description', 'Linked Transaction ID', 'Exclude from estimate']
  const rows = data.transactions.filter(tx => tx.status === 'posted').map(tx => {
    const account = accounts.get(tx.account_id)
    const category = categories.get(tx.category_id)
    return [field(tx, 'date'), field(tx, 'id'), field(tx, 'account_id'), field(account, 'name'),
      field(account, 'currency'), field(tx, 'category_id'), field(category, 'name'),
      tx.linked_transaction_id ? 'Transfer' : Number(tx.amount) >= 0 ? 'Income' : 'Expense',
      field(tx, 'amount'), field(tx, 'description'), field(tx, 'linked_transaction_id'),
      tx.exclude_from_estimate ? 'Yes' : 'No']
  })
  return [headers, ...rows].map(row => row.map(escapeCSV).join(',')).join('\n')
}
