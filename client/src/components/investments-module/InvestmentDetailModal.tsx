import { holdingSourceTime } from './holding-presentation'
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
import { amount, costPrice, unitPrice, signedAmount, percentage, tone } from './overview'
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
  const ratio=p.gainLoss!=null&&Number.isFinite(p.gainLoss)&&p.netInvested!=null&&Number.isFinite(p.netInvested)&&p.netInvested>0?p.gainLoss/p.netInvested*100:null
  const gainPercent=ratio!=null&&Number.isFinite(ratio)?ratio:null
  const sourceDate=market?q?.as_of:account.manual_valuation?.as_of??account.manual_price_date
  const sourceTime=holdingSourceTime(sourceDate)
  const protectedAccount = account.is_locked || account.archived_at != null
  const stat = (label: string, value: string, sub?: string) => (
    <div key={label} className="min-w-0 bg-card px-3 py-3 sm:px-4">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 break-words text-[15px] font-semibold tabular-nums">{value}</dd>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
  const unitMoney=(value:number|null|undefined,currency:string)=>hidden?'••••••':value==null?'Unavailable':Math.abs(value)>=1?`${value.toLocaleString('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`:unitPrice(value,currency)
  const positionGrid=<section aria-label="Your position" className="space-y-3">
    <h3 className="text-sm font-semibold">Your position</h3>
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border @min-[480px]:grid-cols-3">
      <div className="min-w-0 bg-card px-3 py-3 sm:px-4">
        <dt className="text-[11px] text-muted-foreground">{total?'Ownership':account.currency==='SHARE'?'Shares':`Quantity · ${account.currency}`}</dt>
        <dd className="mt-1.5 break-words text-[15px] font-semibold tabular-nums" title={hidden?undefined:total?undefined:p.actualQuantity.toLocaleString('hu-HU',{maximumFractionDigits:12})}>
          {hidden?'••••••':total?(account.manual_ownership??'Unknown'):p.actualQuantity.toLocaleString('hu-HU',{maximumFractionDigits:account.asset_type==='crypto'||(p.actualQuantity!==0&&Math.abs(p.actualQuantity)<0.0001)?12:4})}
        </dd>
      </div>
      {stat(total?'Remaining cost':'Average cost',total?costPrice(p.metrics.native.remaining_basis,p.metrics.native_currency,hidden):unitMoney(p.metrics.native.average_cost,p.metrics.native_currency))}
      <div className="min-w-0 bg-card px-3 py-3 sm:px-4">
        <dt className="text-[11px] text-muted-foreground">{total?'Last valued':'Current price'}</dt>
        <dd className="mt-1.5 break-words text-[15px] font-semibold tabular-nums">{total?(sourceTime?.short??'Unknown'):unitMoney(market?(q?.price??q?.regularMarketPrice):(account.manual_price??null),market?q?.currency||p.quoteCurrency:p.quoteCurrency)}</dd>
        {!total&&sourceTime&&<p className="mt-1 text-[10px] text-muted-foreground"><time dateTime={sourceDate??undefined} title={sourceTime.full}>{sourceTime.short}</time></p>}
      </div>
      {stat('Cost basis',amount(p.metrics.remaining_basis,reportingCurrency,hidden),'Paid for units you hold')}
      <div className="min-w-0 bg-card px-3 py-3 sm:px-4"><dt className="text-[11px] text-muted-foreground">Unrealized gain</dt><dd className={`mt-1.5 break-words text-[15px] font-semibold tabular-nums ${tone(p.metrics.unrealized_gain,hidden)}`}>{signedAmount(p.metrics.unrealized_gain,reportingCurrency,hidden)}</dd><p className="mt-1 text-[10px] text-muted-foreground">On current holdings</p></div>
      <div className="min-w-0 bg-card px-3 py-3 sm:px-4"><dt className="text-[11px] text-muted-foreground">Realized gain</dt><dd className={`mt-1.5 break-words text-[15px] font-semibold tabular-nums ${tone(p.metrics.realized_gain,hidden)}`}>{signedAmount(p.metrics.realized_gain,reportingCurrency,hidden)}</dd><p className="mt-1 text-[10px] text-muted-foreground">{p.metrics.realized_gain===0?'No realized profit or loss':'From sold units'}</p></div>
    </dl>
  </section>
  return (
    <Modal
      isOpen
      onClose={close}
      title={account.name}
      subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{account.symbol}</span><span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{account.asset_type?.toUpperCase()??'Holding'}</span>{(q?.exchangeName||q?.exchange||p.quoteCurrency)&&<span>{[q?.exchangeName||q?.exchange,p.quoteCurrency].filter(Boolean).join(' · ')}</span>}</span>}
      headerLeading={<span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-xs font-bold text-primary">{(account.symbol||account.name).slice(0,2).toUpperCase()}</span>}
      headerClassName="px-4 py-4 sm:px-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground"
      subtitleClassName="text-xs font-normal tracking-normal whitespace-normal"
      placement="centered"
      className="flex min-h-0 max-h-[92dvh] flex-col rounded-2xl sm:max-w-[600px]"
      contentClassName="flex min-h-0 flex-1 flex-col p-0 sm:p-0"
    >
      <div className="@container min-h-0 flex-1 space-y-7 overflow-y-auto p-4 sm:p-6">
        <section aria-label="Holding summary" className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Position value</p>
          <p className="break-words text-[34px] font-bold leading-tight tracking-tight tabular-nums">
            <span>{hidden?'••••••':p.currentValue==null?'Unavailable':p.currentValue.toLocaleString('hu-HU',{maximumFractionDigits:reportingCurrency==='HUF'?0:2})}</span><span className="ml-2 text-[15px] font-semibold tracking-normal text-muted-foreground">{reportingCurrency}</span>
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] tabular-nums"><span className={`font-semibold ${tone(p.gainLoss,hidden)}`}>{signedAmount(p.gainLoss,reportingCurrency,hidden)}</span>{gainPercent!=null&&<span className={`font-semibold ${tone(p.gainLoss,hidden)}`} title="Gain on net invested">{percentage(gainPercent,hidden)}</span>}<span className="text-muted-foreground">total gain</span></p>
        </section>
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
            Delayed price · {freshness.ageLabel}. Today’s return is unavailable until a fresh quote arrives.
          </p>
        )}
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
              quote={q}
            >{positionGrid}</InvestmentChart>
          ))}
        {(!market||!account.symbol||hidden)&&positionGrid}
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
        <div className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-border bg-card px-4 py-3 sm:px-6">
          <Button
            type="button"
            disabled={!canTrade || !!protectedAccount || hidden || dirty || editing}
            onClick={() => onTrade('buy')} className="h-10 rounded-xl"
          >
            Buy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canTrade || !!protectedAccount || hidden || dirty || editing}
            onClick={() => onTrade('sell')} className="h-10 rounded-xl"
          >
            Sell
          </Button>
        </div>
      )}
    </Modal>
  )
}
