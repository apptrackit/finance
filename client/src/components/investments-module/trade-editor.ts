import { validHoldingNumber, validLocalDate } from '../../../../shared/holding'
import {
  addExact,
  roundSettlement,
  validSettlement,
  tradeCurrencies,
} from '../../../../shared/investment-trade'
import type { TradeInput, TradeFacts } from '../../../../shared/investment-trade'
import { parseAmount, formatAmount } from '../../lib/amount'
import { localAccountDate } from '../dashboard-module/account-form'
import type { Account } from './types'
export type SavedTrade = TradeFacts & {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  date: string
  notes?: string | null
  linked_transaction_id?: string | null
}
export type TradeEdit = { trade: SavedTrade; cash_account_id: string; linked_cash?: {amount:number;currency:string}; source_revision: number }
export type TradeDraft = {
  holding: string
  cash: string
  type: 'buy' | 'sell'
  quantity: string
  price: string
  currency: string
  cashAmount: string
  feeStatus: 'known' | 'unknown'
  fee: string
  date: string
  notes: string
  cashConfirmed: boolean
  priceConfirmed: boolean
  quoteSuggestion: boolean
}
export const draftNumber = (n: number) => formatAmount(n, { maximumFractionDigits: 12 })
export function initialTrade(
  holdings: Account[],
  cash: Account[],
  holdingId?: string,
  type: 'buy' | 'sell' = 'buy',
  edit?: TradeEdit,
): TradeDraft {
  const t = edit?.trade,
    a =
      holdings.find((a) => a.id === (t?.account_id ?? holdingId)) ??
      holdings.find((a) => !a.is_locked && a.archived_at == null)
  const linked=edit?.linked_cash, cashCurrency=cash.find(a=>a.id===edit?.cash_account_id)?.currency
  const paid=t?.cash_amount ?? (linked && linked.currency===cashCurrency && Number.isFinite(linked.amount) && linked.amount>=0 ? linked.amount : null)
  return {
    holding: a?.id ?? '',
    cash: edit?.cash_account_id ?? cash.find((a) => !a.is_locked && a.archived_at == null)?.id ?? '',
    type: t?.type ?? type,
    quantity: t ? draftNumber(t.quantity) : a?.asset_type === 'manual' ? '1' : '',
    price: t ? draftNumber(t.price) : '',
    currency: t?.execution_currency ?? (a?.asset_type === 'manual' ? a.currency : a?.quote_currency) ?? '',
    cashAmount: paid != null ? draftNumber(paid) : '',
    feeStatus: t?.fee_status ?? 'known',
    fee: t?.fee_amount != null ? draftNumber(t.fee_amount) : '',
    date: t?.date ?? localAccountDate(),
    notes: t?.notes ?? '',
    cashConfirmed: !!t,
    priceConfirmed: true,
    quoteSuggestion: false,
  }
}
export function validateTrade(
  d: TradeDraft,
  holding: Account | undefined,
  cash: Account | undefined,
  edit?: TradeEdit,
): {
  input: Omit<TradeInput, 'idempotency_key'> | null
  error: string | null
} {
  const fail = (error: string) => ({ input: null, error })
  if (!holding || !cash || cash.type !== 'cash') return fail('Choose a holding and a cash account.')
  if (holding.is_locked || cash.is_locked || holding.archived_at != null || cash.archived_at != null)
    return fail('Unlock or restore both accounts before changing a trade.')
  const q = parseAmount(d.quantity),
    p = parseAmount(d.price),
    m = parseAmount(d.cashAmount),
    f = d.feeStatus === 'known' ? parseAmount(d.fee) : null
  if (q === null || q <= 0 || !validHoldingNumber(q))
    return fail('Enter units within the supported 12-decimal precision.')
  if (
    p === null ||
    !validHoldingNumber(p) ||
    !(tradeCurrencies as readonly string[]).includes(d.currency) ||
    !d.priceConfirmed
  )
    return fail('Confirm the actual executed price and currency.')
  if (m === null || !validSettlement(m))
    return fail('Enter actual cash with at most two settlement decimals.')
  if (d.feeStatus === 'known' && (f === null || !validSettlement(f)))
    return fail('Enter the included fee, including zero.')
  if (!validLocalDate(d.date) || d.date > localAccountDate())
    return fail('Choose today or an earlier execution date; future trades cannot be posted.')
  if (d.notes.length > 500) return fail('Notes support at most 500 characters.')
  const total = holding.asset_type === 'manual',
    zero = total && d.type === 'sell' && p === 0 && m === 0 && f === 0
  if (total && (q !== 1 || d.currency !== holding.currency))
    return fail('A manual asset is one whole ITEM, priced in its saved valuation currency.')
  if (!zero && (p <= 0 || m <= 0)) return fail('Execution price and actual cash must be positive.')
  const gross = q * p
  if (!Number.isFinite(gross) || gross > 1e12)
    return fail('Gross execution amount exceeds the supported range.')
  if (d.currency === cash.currency) {
    if (f === null) return fail('Confirm the included fee for a same-currency trade.')
    if (Math.abs(roundSettlement(gross + (d.type === 'buy' ? f : -f)) - m) > 1e-8)
      return fail('Actual cash must equal settled gross plus the buy fee or minus the sale fee.')
  } else {
    if (!d.cashConfirmed) return fail('Confirm the actual cross-currency cash settlement.')
    if (!zero && f !== null && (d.type === 'buy' ? m - f : m + f) <= 0)
      return fail('Included fee must leave a positive gross cash settlement.')
  }
  try {
    // Unsupported stored mirrors may contain recoverable legacy residue. Only
    // the authoritative preview has the ledger evidence to decide; do not
    // round the mirror locally or block that preview. New inputs stay strict.
    if (!total && validHoldingNumber(holding.balance)) {
      const before =
        edit && edit.trade.account_id === holding.id
          ? addExact(holding.balance, edit.trade.type === 'buy' ? -edit.trade.quantity : edit.trade.quantity)
          : holding.balance
      const position = addExact(before, d.type === 'buy' ? q : -q)
      if (position < 0) return fail('This sale exceeds the units available after undoing the original trade.')
    }
  } catch {
    return fail('Result exceeds supported amount precision or range.')
  }
  return {
    input: {
      holding_account_id: holding.id,
      cash_account_id: cash.id,
      type: d.type,
      quantity: q,
      price: p,
      execution_currency: d.currency,
      cash_amount: m,
      fee_status: d.feeStatus,
      fee_amount: f,
      date: d.date,
      notes: d.notes,
      ...(edit ? { expected_version: edit.trade.trade_version } : {}),
    },
    error: null,
  }
}
