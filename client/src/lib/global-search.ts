import { parseAmount } from './amount'

export type SearchableTransaction = { account_id: string; category_id?: string | null; amount: number; description?: string | null; date: string }
export type SearchAccount = { id: string; name: string; currency: string; type?: string; quote_currency?: string; asset_type?: string }
export type SearchCategory = { id: string; name: string }

export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const matchesText = (query: string, ...fields: (string | undefined | null)[]) => {
  const text = normalizeSearch(fields.filter(Boolean).join(' '))
  return normalizeSearch(query).split(/\s+/).every(word => text.includes(word))
}

export function transactionCurrency(account?: SearchAccount): string {
  return account?.type === 'investment' && account.asset_type !== 'manual' ? account.quote_currency || 'USD' : account?.currency || ''
}

function matchesAmount(query: string, amount: number): boolean {
  if (!/^[+-]?[\d\s.,]+$/.test(query)) return false
  const input = query.replace(/^\+/, '')
  const candidates = [parseAmount(input), parseAmount(input.replace(/[,.](?=\d{3}(?:[,.]|$))/g, ''))]
  return candidates.some(value => value !== null && Number.isFinite(value) &&
    Math.abs((/^[+-]/.test(query) ? amount : Math.abs(amount)) - value) < 1e-8)
}

// Compare native monetary amounts; never treat a holding's SHARE/BTC unit as
// its transaction's fiat currency, or search by a silently converted amount.
export function matchesTransaction(query: string, transaction: SearchableTransaction, accounts: readonly SearchAccount[], categories: readonly SearchCategory[]): boolean {
  const account = accounts.find(item => item.id === transaction.account_id)
  const category = categories.find(item => item.id === transaction.category_id)
  const currency = transactionCurrency(account)
  const text = [transaction.description, account?.name, category?.name, transaction.date,
    transaction.date.split('-').reverse().join('/'), currency].filter(Boolean).join(' ')
  const normalized = normalizeSearch(query)
  const amountQuery = normalized.split(/\s+/).filter(word => word !== normalizeSearch(currency)).join(' ')
  if (matchesAmount(amountQuery, transaction.amount)) return true
  return normalized.split(/\s+/).every(word => matchesText(word, text) || matchesAmount(word, transaction.amount))
}
