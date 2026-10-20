import { investmentReportingCurrencies } from './reporting-currencies'
import type { CurrencyMetrics, InvestmentMetricsSnapshot } from '../../../../shared/investment-metrics'
import {isoDate} from '../../../../shared/market-data'
import type { TradeFacts } from '../../../../shared/investment-trade'
import { API_BASE_URL, apiFetch } from '../../config'
import type { Account, Category, MarketQuote, Transaction } from './types'

export type InvestmentSnapshot = {
  trends: Record<string,import('../../../../shared/investment-overview').HoldingTrend>
  sourceRevision: number
  asOf: string
  date: string
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  quotes: Record<string, MarketQuote>
  metrics: Record<string,CurrencyMetrics>
  exchangeRates: Record<string, number>
}

type InvestmentTrade = TradeFacts & {
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
const trend=(value:unknown):boolean=>record(value)&&typeof value.currency==='string'&&['unit_price','total_value'].includes(String(value.kind))
  &&['linear','step'].includes(String(value.method))&&['ok','stale','missing'].includes(String(value.status))
  &&Array.isArray(value.points)&&value.points.length<=30&&value.points.every(p=>record(p)&&isoDate(p.date)&&(p.value===null||finite(p.value)&&p.value>=0)
    &&(p.as_of===null||isoDate(p.as_of))&&typeof p.provisional==='boolean')
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
  const [response,categories] = await Promise.all([
    apiFetch(`${API_BASE_URL}/investment-metrics?overview=1&currencies=${investmentReportingCurrencies.join(',')}`,{throwOnError:true,signal}),
    readArray('/categories',category,signal),
  ])
  const snapshot: InvestmentMetricsSnapshot = await response.json()
  if (!Number.isSafeInteger(snapshot.source_revision) || snapshot.source_revision<0 || !isoDate(snapshot.date)
    || typeof snapshot.as_of!=='string' || !Number.isFinite(Date.parse(snapshot.as_of)) || !Array.isArray(snapshot.accounts) || !snapshot.accounts.every(account) || !Array.isArray(snapshot.trades) || !snapshot.trades.every(trade)
    || investmentReportingCurrencies.some(c=>!snapshot.by_currency?.[c]) || !snapshot.current_fx?.rates || !snapshot.quotes) throw new Error('Invalid investment metrics response')
  if(snapshot.overview!==undefined&&(!record(snapshot.overview.trends)||!Object.values(snapshot.overview.trends).every(trend)
    ||snapshot.accounts.some(a=>!Object.hasOwn(snapshot.overview!.trends,a.id))))throw new Error('Invalid overview trends')
  const allAccounts=snapshot.accounts as Account[],trades=snapshot.trades as InvestmentTrade[]
  const accounts = allAccounts.filter(item => item.type === 'investment' && item.archived_at == null)
  const accountById = new Map(accounts.map(item => [item.id, item]))
  const transactions: Transaction[] = trades.filter(item => accountById.has(item.account_id)).map(item => ({
    ...item, id: item.id, account_id: item.account_id,
    amount: item.type === 'buy' ? item.total_amount : -item.total_amount,
    quantity: item.type === 'buy' ? item.quantity : -item.quantity,
    price: item.price, date: item.date, is_recurring: false,
    linked_transaction_id: item.linked_transaction_id ?? undefined,
    description: item.execution_currency ? `${item.type === 'buy' ? 'Buy' : 'Sell'} ${item.quantity} units @ ${item.price} ${item.execution_currency}${item.notes ? ` · ${item.notes}` : ''}` : accountById.get(item.account_id)!.holding_position
      ? `${item.notes || `${item.quantity} units @ ${item.price}`} · execution currency unverified`
      : description(item, accountById.get(item.account_id)!.quote_currency || 'trading currency'),
  }))
  signal.throwIfAborted()
  return { trends:snapshot.overview?.trends??{},sourceRevision:snapshot.source_revision,asOf:snapshot.as_of,date:snapshot.date,accounts, transactions, categories, quotes:snapshot.quotes, exchangeRates:snapshot.current_fx.rates,metrics:snapshot.by_currency }
}
