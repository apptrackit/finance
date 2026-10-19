import { quotePresentation } from './quote-presentation'
import { useRef, useState } from 'react'
import type { HoldingMetrics } from '../../../../shared/investment-metrics'
import { usesMarketPricing } from '../../../../shared/holding'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { useHasUnsavedChanges } from '../../navigation/UnsavedChanges'
import { useAlert } from '../../context/AlertContext'
import { ManualValuations } from './ManualValuations'
import { InvestmentChart } from './InvestmentChart'
import type { HoldingChartCache } from './InvestmentChart'
import type { Account, MarketQuote, Transaction } from './types'
import { calculatePosition } from './utils'
import { amount, costPrice, unitPrice, signedAmount, tone } from './overview'
type Props = {
  account: Account | null
  allTransactions: Transaction[]
  quotes: Record<string, MarketQuote>
  exchangeRates: Record<string, number>
  privacyMode: string
  metrics?: HoldingMetrics
  reportingCurrency?: string
  onClose: () => void
  onValuationSaved?: () => void
  onTrade: (type: 'buy' | 'sell') => void
  onEdit: (trade: Transaction) => void
  canTrade: boolean
  chartCache: HoldingChartCache
  revisionKey: string
  editing: boolean
  editError: string | null
}
export function InvestmentDetailModal({
  account,
  allTransactions,
  quotes,
  exchangeRates,
  privacyMode,
  metrics,
  reportingCurrency = 'USD',
  onClose,
  onValuationSaved = () => {},
  onTrade,
  onEdit,
  canTrade,
  chartCache,
  revisionKey,
  editing,
  editError,
}: Props) {
  const dirty = useHasUnsavedChanges(),
    { confirm } = useAlert(),
    asking = useRef(false)
  const [count, setCount] = useState(20),
    [manualBusy, setManualBusy] = useState(false)
  const close = () => {
    if (asking.current || editing || manualBusy) return
    if (!dirty) onClose()
    else {
      asking.current = true
      void confirm({
        title: 'Discard unfinished appraisal?',
        message: 'Your unsaved appraisal will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      }).then((ok) => {
        asking.current = false
        if (ok) onClose()
      })
    }
  }
  if (!account) return null
  const hidden = privacyMode === 'hidden',
    total = account.asset_type === 'manual',
    market = usesMarketPricing(account)
  const transactions = allTransactions
    .filter((t) => t.account_id === account.id)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.effective_order ?? 0) - (a.effective_order ?? 0) ||
        b.id.localeCompare(a.id),
    )
  const p = calculatePosition(account, transactions, quotes, exchangeRates, metrics, reportingCurrency),
    q = quotes[account.symbol?.trim().toUpperCase() ?? '']
  const freshness = quotePresentation(q)
  const protectedAccount = account.is_locked || account.archived_at != null
  const stat = (label: string, value: string, sub?: string) => (
    <div key={label} className="min-w-0 bg-card px-3 py-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</dd>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
  return (
    <Modal
      isOpen
      onClose={close}
      title={account.symbol || account.name}
      subtitle={`${account.name} · ${account.asset_type?.toUpperCase() ?? 'Holding'}`}
      placement="centered"
      className="flex min-h-0 max-h-[92dvh] flex-col sm:max-w-4xl"
      contentClassName="flex min-h-0 flex-1 flex-col p-0 sm:p-0"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        <div>
          <p className="text-xs text-muted-foreground">Holding value · {reportingCurrency}</p>
          <p className="mt-1 break-words text-3xl font-semibold tracking-tight tabular-nums">
            {amount(p.currentValue, reportingCurrency, hidden)}
          </p>
          <p className={`mt-2 text-sm tabular-nums ${tone(p.gainLoss, hidden)}`}>
            {signedAmount(p.gainLoss, reportingCurrency, hidden)}
          </p>
        </div>
        {(protectedAccount || (market && freshness.needsAttention) || p.priceFetchError) && (
          <p
            role="status"
            className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"
          >
            {protectedAccount ? 'Unlock or restore the holding before changing it. ' : ''}
            {market && freshness.needsAttention
              ? 'Market price is stale; the last known source is shown. '
              : ''}
            {p.priceFetchError
              ? 'Current valuation is unavailable; independently known fields remain visible.'
              : ''}
          </p>
        )}
        {market && freshness.delayed && (
          <p className="text-xs text-muted-foreground">
            Delayed price · {freshness.ageLabel} · {q?.as_of}. Last known price is shown;
            Today’s return remains unavailable until a fresh quote arrives.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {stat(
            total ? 'Ownership' : 'Quantity',
            hidden
              ? '••••••'
              : total
                ? (account.manual_ownership ?? 'Unknown')
                : `${p.actualQuantity.toLocaleString(undefined, { maximumFractionDigits: 12 })} ${account.currency}`,
          )}
          {stat(
            total ? 'Remaining cost' : 'Average remaining cost',
            costPrice(
              total ? p.metrics.native.remaining_basis : p.metrics.native.average_cost,
              p.metrics.native_currency,
              hidden,
            ),
            'Known native basis · includes fees',
          )}
          {stat(
            total ? 'Last valued' : 'Native price',
            total
              ? (account.manual_valuation?.as_of ?? 'Unknown')
              : unitPrice(
                  market ? (q?.price ?? q?.regularMarketPrice) : (account.manual_price ?? null),
                  market ? q?.currency || p.quoteCurrency : p.quoteCurrency,
                  hidden,
                ),
            market
              ? (q?.as_of ?? 'Source time unavailable')
              : (account.manual_valuation?.as_of ?? account.manual_price_date ?? 'No dated observation'),
          )}
          {stat(
            'Net invested',
            amount(p.netInvested, reportingCurrency, hidden),
            'Exact cash paid minus received',
          )}
        </dl>
        <details className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
          <summary className="min-h-7 cursor-pointer">Accounting and return coverage</summary>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            {[
              ['Remaining basis', p.metrics.remaining_basis],
              ['Realized gain', p.metrics.realized_gain],
              ['Unrealized gain', p.metrics.unrealized_gain],
            ].map(([label, value]) =>
              stat(String(label), amount(value as number | null, reportingCurrency, hidden)),
            )}
          </dl>
          <p className="mt-3">
            Moving weighted-average remaining cost uses acquisition-date FX. Imported basis does not prove
            earlier cash or realized gains. Lifetime Estimated return requires complete daily history.
          </p>
          <p className="mt-2">
            {[...new Set(Object.values(p.metrics.coverage).flat())].join(', ').replaceAll('_', ' ') ||
              'Current accounting inputs covered'}
          </p>
        </details>
        {!market && (
          <ManualValuations
            account={account}
            hidden={hidden}
            onSaved={onValuationSaved}
            referenceCost={total ? p.metrics.native.remaining_basis : p.metrics.native.average_cost}
            onBusyChange={setManualBusy}
          />
        )}
        {market &&
          account.symbol &&
          (hidden ? (
            <p className="rounded-xl border border-border p-6 text-center text-xs text-muted-foreground">
              Price chart and executions hidden for privacy.
            </p>
          ) : (
            <InvestmentChart
              symbol={account.symbol}
              transactions={transactions}
              averageCost={p.metrics.native.average_cost}
              costCurrency={p.metrics.native_currency}
              cache={chartCache}
              revisionKey={revisionKey}
            />
          ))}
        <section aria-label="Holding trade history">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Trade history</h3>
            <span className="text-xs text-muted-foreground">{transactions.length}</span>
          </div>
          {!transactions.length && (
            <p className="py-6 text-xs text-muted-foreground">
              No recorded trades. An opening position may still establish current ownership.
            </p>
          )}
          <ul className="mt-2 divide-y divide-border">
            {transactions.slice(0, count).map((t, index) => {
              const buy = (t.quantity ?? t.amount) > 0,
                label =
                  t.asset_event === 'acquisition'
                    ? 'Acquired'
                    : t.asset_event === 'disposal'
                      ? 'Disposed'
                      : buy
                        ? 'Buy'
                        : 'Sell'
              const legacyLinked = !total && !!t.linked_transaction_id &&
                Number.isSafeInteger(t.trade_version) && t.trade_version! >= 0 &&
                (!t.execution_currency || t.cash_amount == null)
              const editable = legacyLinked || (
                !!t.linked_transaction_id &&
                t.trade_version != null &&
                !!t.execution_currency &&
                t.cash_amount != null)
              return (
                <li key={t.id} className="space-y-1 py-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="rounded border border-border bg-secondary px-1.5 py-1 text-[10px] font-semibold">
                      {label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs tabular-nums">
                        {hidden
                          ? '••••••'
                          : `${Math.abs(t.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 12 })} ${total ? 'ITEM' : account.currency} @ ${unitPrice(t.price, t.execution_currency ?? 'unverified currency')}`}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{t.date}</p>
                    </div>
                    <p className="break-words text-right text-xs font-semibold tabular-nums">
                      {amount(t.cash_amount, t.cash_currency ?? 'unverified currency', hidden)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                    <p>
                      Included fee:{' '}
                      {hidden
                        ? '••••••'
                        : t.fee_status === 'known'
                          ? amount(t.fee_amount, t.fee_currency ?? t.cash_currency ?? '')
                          : 'Unknown breakdown'}
                    </p>
                    {(editable || (!total && !t.linked_transaction_id)) ? (
                      <button
                        type="button"
                        aria-label={`${legacyLinked ? 'Review historical details for' : t.linked_transaction_id ? 'Edit' : 'Confirm historical details for'} ${label.toLowerCase()} on ${t.date}, trade ${index + 1}`}
                        disabled={editing || !!protectedAccount || dirty || hidden}
                        onClick={() => onEdit(t)}
                        className="min-h-10 shrink-0 text-xs font-medium text-primary disabled:opacity-50"
                      >
                        {legacyLinked ? 'Review historical details' : t.linked_transaction_id ? 'Edit trade' : t.cash_amount == null ? 'Confirm historical details' : 'Review historical details'}
                      </button>
                    ) : (
                      <span>Legacy record · read only</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {transactions.length > count && (
            <Button type="button" variant="ghost" onClick={() => setCount((n) => n + 20)}>
              Show older trades
            </Button>
          )}
          {editing && (
            <p role="status" className="text-xs text-muted-foreground">
              Checking linked cash and saved trade version…
            </p>
          )}
          {editError && (
            <p role="alert" className="text-xs text-destructive">
              {editError}
            </p>
          )}
        </section>
      </div>
      {!total && (
        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-card p-4">
          <Button
            type="button"
            disabled={!canTrade || !!protectedAccount || hidden || dirty || editing}
            onClick={() => onTrade('buy')}
          >
            Buy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canTrade || !!protectedAccount || hidden || dirty || editing}
            onClick={() => onTrade('sell')}
          >
            Sell
          </Button>
        </div>
      )}
    </Modal>
  )
}
