import { usesMarketPricing } from '../../../../shared/holding'
import { API_BASE_URL, apiFetch } from '../../config'
import { isValidRate, validRates } from '../../../../shared/currency'
import type { Account, Category, MarketQuote, Transaction } from './types'

export type InvestmentSnapshot = {
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  quotes: Record<string, MarketQuote>
  exchangeRates: Record<string, number>
}

type InvestmentTrade = {
  id: string; account_id: string; type: 'buy' | 'sell'; quantity: number
  price: number; total_amount: number; date: string; notes?: string | null
  linked_transaction_id?: string | null
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const account = (value: unknown): value is Account => record(value) && typeof value.id === 'string'
  && typeof value.name === 'string' && typeof value.currency === 'string' && finite(value.balance)
  && ['cash', 'credit', 'investment'].includes(String(value.type))
const category = (value: unknown): value is Category => record(value) && typeof value.id === 'string'
  && typeof value.name === 'string' && (value.type === 'income' || value.type === 'expense')
const trade = (value: unknown): value is InvestmentTrade => record(value) && typeof value.id === 'string'
  && typeof value.account_id === 'string' && (value.type === 'buy' || value.type === 'sell')
  && finite(value.quantity) && finite(value.price) && finite(value.total_amount) && typeof value.date === 'string'
  && (value.notes == null || typeof value.notes === 'string')
  && (value.linked_transaction_id == null || typeof value.linked_transaction_id === 'string')

async function readArray<T>(path: string, validate: (value: unknown) => value is T, signal: AbortSignal): Promise<T[]> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, { throwOnError: true, signal })
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(validate)) throw new Error('Invalid investment response')
  return data
}

const description = (transaction: InvestmentTrade, quoteCurrency: string) => {
  if (transaction.notes?.startsWith('Transfer from ') && transaction.price > 0) {
    const source = transaction.notes.replace(/\s*\([^)]*\)/, '')
    const noteSuffix = source.match(/\s-\s.*$/)?.[0] || ''
    const sourceName = source.replace(/\s-\s.*$/, '').trim()
    return `${sourceName} (${transaction.quantity} shares @ ${quoteCurrency} ${transaction.price.toFixed(2)}/share)${noteSuffix}`
  }
  return transaction.notes || `${transaction.quantity} shares @ ${quoteCurrency} ${transaction.price}`
}

// One complete snapshot replaces the previous one. Failed account/history reads
// must never publish incomplete quantities or a zero-value portfolio.
export async function readInvestmentSnapshot(signal: AbortSignal): Promise<InvestmentSnapshot> {
  const [allAccounts, trades, categories] = await Promise.all([
    readArray('/accounts', account, signal),
    readArray('/investment-transactions', trade, signal),
    readArray('/categories', category, signal),
  ])
  const accounts = allAccounts.filter(item => item.type === 'investment' && item.archived_at == null)
  const accountById = new Map(accounts.map(item => [item.id, item]))
  const transactions: Transaction[] = trades.filter(item => accountById.has(item.account_id)).map(item => ({
    id: item.id, account_id: item.account_id,
    amount: item.type === 'buy' ? item.total_amount : -item.total_amount,
    quantity: item.type === 'buy' ? item.quantity : -item.quantity,
    price: item.price, date: item.date, is_recurring: false,
    linked_transaction_id: item.linked_transaction_id ?? undefined,
    description: accountById.get(item.account_id)!.holding_position
      ? `${item.notes || `${item.quantity} units @ ${item.price}`} · execution currency unverified`
      : description(item, accountById.get(item.account_id)!.quote_currency || 'trading currency'),
  }))
  const symbols = [...new Set(accounts.filter(item => usesMarketPricing(item) && item.symbol).map(item => item.symbol!))]
  const quotePromise = Promise.all(symbols.map(async symbol => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/market/quote?symbol=${encodeURIComponent(symbol)}`, { throwOnError: true, signal })
      const value: unknown = await response.json()
      if (!record(value) || !finite(value.regularMarketPrice) || (value.currency !== undefined && typeof value.currency !== 'string')) {
        throw new Error('Invalid market quote')
      }
      return [symbol, { ...value, symbol } as MarketQuote] as const
    } catch {
      // Unavailable prices remain explicitly unavailable in calculatePosition.
      return null
    }
  }))
  const ratesPromise = (async () => {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal })
      if (!response.ok) throw new Error('Rates unavailable')
      const value: unknown = await response.json()
      if (!record(value) || !record(value.rates) || !isValidRate(value.rates.USD)) throw new Error('Invalid rates')
      return validRates(value.rates)
    } catch { return {} }
  })()
  const [quoteEntries, exchangeRates] = await Promise.all([quotePromise, ratesPromise])
  signal.throwIfAborted()
  return { accounts, transactions, categories, quotes: Object.fromEntries(quoteEntries.filter(entry => entry !== null)), exchangeRates }
}
