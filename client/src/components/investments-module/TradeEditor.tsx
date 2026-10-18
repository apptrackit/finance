import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL, apiFetch, ApiRequestError } from '../../config'
import { useAlert } from '../../context/AlertContext'
import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { AmountInput } from '../common/amount-input'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { parseAmount } from '../../lib/amount'
import { convertCurrency } from '../../../../shared/currency'
import { roundSettlement, tradeCurrencies } from '../../../../shared/investment-trade'
import type { TradeInput } from '../../../../shared/investment-trade'
import { localAccountDate } from '../dashboard-module/account-form'
import { TradeMetricsPreview, tradePreviewKey } from './TradeMetricsPreview'
import type { PreviewStatus } from './TradeMetricsPreview'
import { draftNumber, initialTrade, validateTrade } from './trade-editor'
import type { TradeEdit, TradeDraft } from './trade-editor'
import type { Account, MarketQuote } from './types'
import { amount, unitPrice } from './overview'
type Props = {
  accounts: Account[]
  holdingId?: string
  type?: 'buy' | 'sell'
  edit?: TradeEdit
  quotes: Record<string, MarketQuote>
  rates: Record<string, number>
  hidden: boolean
  currency: string
  sourceRevision?: number
  onClose: () => void
  onSaved: () => Promise<void>
}
type FailedSave = {
  body: Omit<TradeInput, 'idempotency_key'>
  key: string
  signature: string
  draft: string
  startedAt: number
  uncertain: boolean
}
export function TradeEditor({
  accounts,
  holdingId,
  type = 'buy',
  edit: providedEdit,
  quotes,
  rates,
  hidden,
  currency,
  sourceRevision,
  onClose,
  onSaved,
}: Props) {
  const [edit] = useState(providedEdit)
  const holdings = accounts.filter((a) => a.type === 'investment'),
    cashAccounts = accounts.filter((a) => a.type === 'cash')
  const [draft, setDraft] = useState(() => initialTrade(holdings, cashAccounts, holdingId, type, edit))
  const [initial] = useState(draft)
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [error, setError] = useState<string | null>(null)
  const feedback = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (busy || error) feedback.current?.focus()
  }, [busy, error])
  const [preview, setPreview] = useState<PreviewStatus | null>(null),
    onStatus = useCallback((v: PreviewStatus) => setPreview(v), [])
  const receipt = useRef<{ signature: string; key: string; startedAt: number } | null>(null)
  const [failedSave, setFailedSave] = useState<FailedSave | null>(null),
    [retryExpired, setRetryExpired] = useState(false)
  const draftSnapshot = JSON.stringify(draft)
  const recovering = failedSave?.draft === draftSnapshot ? failedSave : null
  useEffect(() => {
    if (!failedSave) return
    const timer = setTimeout(
      () => setRetryExpired(true),
      Math.max(0, failedSave.startedAt + 86_400_000 - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [failedSave])
  const { confirm, showAlert } = useAlert()
  const holding = holdings.find((a) => a.id === draft.holding),
    cash = cashAccounts.find((a) => a.id === draft.cash),
    total = holding?.asset_type === 'manual'
  const validation = validateTrade(draft, holding, cash, edit),
    signature = tradePreviewKey(validation.input, edit?.trade.id, sourceRevision)
  const cashPreview = preview?.cashAfter
  const serverCash =
    !recovering &&
    preview?.key === signature &&
    cashPreview &&
    cashPreview.account_id === cash?.id &&
    cashPreview.currency === cash?.currency &&
    Number.isFinite(cashPreview.balance)
      ? cashPreview.balance
      : null
  const serverPosition =
    !recovering &&
    preview?.key === signature &&
    typeof preview.position === 'number' &&
    Number.isFinite(preview.position)
      ? preview.position
      : null
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const ready =
    !hidden &&
    (!edit || dirty) &&
    (recovering
      ? !retryExpired
      : !!validation.input &&
        preview?.key === signature &&
        preview.ready &&
        serverCash !== null &&
        serverPosition !== null)
  useUnsavedChanges(dirty || busy)
  const patch = (v: Partial<TradeDraft>) => {
    if (failedSave?.uncertain || busyRef.current || hidden) return
    setDraft((d) => ({ ...d, ...v }))
    setError(null)
  }
  const settlementPatch = (v: Partial<TradeDraft>) => patch({ ...v, cashConfirmed: false })
  const closing = useRef(false)
  const close = () => {
    if (busyRef.current || closing.current) return
    if (!dirty) onClose()
    else {
      closing.current = true
      void confirm({
        title: recovering ? 'Close failed trade?' : 'Discard unfinished trade?',
        message: recovering
          ? 'Closing loses this retry key. Check trade history for the previous save outcome before starting another trade.'
          : 'Your unsaved trade will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      }).then((ok) => {
        closing.current = false
        if (ok) onClose()
      })
    }
  }
  const save = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (busyRef.current || !ready || (!recovering && !validation.input)) return
      const submittedAt = Date.now()
      if (recovering && submittedAt - recovering.startedAt >= 86_400_000) {
        setRetryExpired(true)
        return
      }
      busyRef.current = true
      setBusy(true)
      setError(null)
      const body = recovering?.body ?? validation.input!,
        requestSignature = JSON.stringify([edit?.trade.id, body])
      if (recovering)
        receipt.current = {
          signature: recovering.signature,
          key: recovering.key,
          startedAt: recovering.startedAt,
        }
      else if (receipt.current?.signature !== requestSignature)
        receipt.current = { signature: requestSignature, key: crypto.randomUUID(), startedAt: submittedAt }
      const request = receipt.current!
      try {
        await apiFetch(
          `${API_BASE_URL}/investment-trades${edit ? `/${encodeURIComponent(edit.trade.id)}` : ''}`,
          {
            method: edit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, idempotency_key: request.key }),
          },
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save trade'
        setRetryExpired(false)
        setFailedSave({
          ...request,
          body,
          draft: draftSnapshot,
          uncertain: !(e instanceof ApiRequestError && e.status >= 400 && e.status < 500 && e.code),
        })
        setError(message)
        showAlert({ type: 'error', message })
        busyRef.current = false
        setBusy(false)
        return
      }
      showAlert({
        type: 'success',
        message: edit ? 'Trade and linked cash updated.' : 'Trade recorded with its linked cash movement.',
      })
      await onSaved().catch(() =>
        showAlert({
          type: 'warning',
          message: 'Trade saved. Refresh the page data to see the latest balances.',
        }),
      )
      onClose()
    },
    [ready, recovering, validation.input, edit, draftSnapshot, showAlert, onSaved, onClose],
  )
  const remove = async () => {
    if (!edit || busyRef.current || hidden) return
    busyRef.current = true
    const ok = await confirm({
      title: 'Delete linked trade?',
      message:
        'This removes the trade and its cash transaction, reversing both movements. Later trades must remain valid.',
      confirmText: 'Delete trade',
      cancelText: 'Cancel',
    })
    if (!ok) {
      busyRef.current = false
      setBusy(false)
      return
    }
    setBusy(true)
    try {
      await apiFetch(
        `${API_BASE_URL}/investment-trades/${encodeURIComponent(edit.trade.id)}?expected_version=${edit.trade.trade_version}`,
        { method: 'DELETE' },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not delete trade'
      setError(message)
      showAlert({ type: 'error', message })
      busyRef.current = false
      setBusy(false)
      return
    }
    showAlert({ type: 'success', message: 'Both linked records reversed and deleted.' })
    await onSaved().catch(() =>
      showAlert({
        type: 'warning',
        message: 'Trade deleted. Refresh the page data to see the latest balances.',
      }),
    )
    onClose()
  }
  const q = total ? 1 : parseAmount(draft.quantity),
    p = parseAmount(draft.price),
    fee = draft.feeStatus === 'known' ? parseAmount(draft.fee) : null
  const gross = q !== null && p !== null ? q * p : null
  const calculated =
    gross !== null && fee !== null ? roundSettlement(gross + (draft.type === 'buy' ? fee : -fee)) : null
  const quote = quotes[holding?.symbol?.trim().toUpperCase() ?? ''],
    today = draft.date === localAccountDate()
  const latest = quote?.price ?? quote?.regularMarketPrice
  const suggested =
    gross === null || !cash ? null : convertCurrency(gross, draft.currency, cash.currency, rates, 'USD').value
  const cashSuggestion =
    suggested !== null && fee !== null
      ? roundSettlement(suggested + (draft.type === 'buy' ? fee : -fee))
      : null
  const display = (value: string) => (hidden ? '••••••' : value)
  return (
    <Modal
      isOpen
      onClose={close}
      title={edit ? 'Edit linked trade' : 'Record trade'}
      subtitle={holding?.symbol || holding?.name || 'Choose a holding'}
      placement="center"
      className="flex min-h-0 max-h-[94dvh] flex-col sm:max-w-[520px]"
      contentClassName="min-h-0 overflow-y-auto p-0 sm:p-0"
    >
      <form onSubmit={save} aria-label="Investment trade" className="flex min-h-0 flex-col">
        {edit && (
          <p className="px-5 pt-4 text-xs text-muted-foreground">
            Replacing this trade reverses its original cash and units first. The preview includes that
            reversal.
          </p>
        )}
        <fieldset
          disabled={busy || hidden || !!failedSave?.uncertain}
          className="min-w-0 space-y-4 p-4 sm:p-5"
        >
          <div
            role="group"
            aria-label="Trade direction"
            className="grid grid-cols-2 rounded-xl border border-border bg-background p-1"
          >
            {(['buy', 'sell'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={draft.type === t}
                onClick={() => settlementPatch({ type: t })}
                className={`min-h-10 rounded-lg text-sm font-semibold ${draft.type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {t === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="trade-holding">Holding</Label>
            <Select
              id="trade-holding"
              value={draft.holding}
              disabled={!!edit}
              onChange={(e) => {
                const a = holdings.find((a) => a.id === e.target.value)
                settlementPatch({
                  holding: e.target.value,
                  quantity: a?.asset_type === 'manual' ? '1' : '',
                  price: '',
                  quoteSuggestion: false,
                  priceConfirmed: true,
                  currency: (a?.asset_type === 'manual' ? a.currency : a?.quote_currency) ?? '',
                  cashAmount: '',
                })
              }}
            >
              <option value="">Choose holding</option>
              {holdings
                .filter((a) => a.id === draft.holding || (!a.is_locked && a.archived_at == null))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol || a.name}
                  </option>
                ))}
            </Select>
          </div>
          {total && (
            <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
              This records acquisition or disposal of one whole asset with linked cash. To change its
              appraisal, use Update value in holding details.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="trade-units">{total ? 'Whole asset (ITEM)' : 'Quantity'}</Label>
              <AmountInput
                id="trade-units"
                value={display(draft.quantity)}
                readOnly={total || hidden}
                onValueChange={(quantity) => settlementPatch({ quantity })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trade-date">Execution date</Label>
              <Input
                id="trade-date"
                type="date"
                max={localAccountDate()}
                value={draft.date}
                onChange={(e) =>
                  settlementPatch({
                    date: e.target.value,
                    ...(draft.quoteSuggestion
                      ? { price: '', quoteSuggestion: false, priceConfirmed: true }
                      : {}),
                  })
                }
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
            <div className="space-y-1">
              <Label htmlFor="trade-price">{total ? 'Executed total price' : 'Executed unit price'}</Label>
              <AmountInput
                id="trade-price"
                value={display(draft.price)}
                onValueChange={(price) =>
                  settlementPatch({ price, priceConfirmed: true, quoteSuggestion: false })
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trade-currency">Currency</Label>
              <Select
                id="trade-currency"
                value={draft.currency}
                disabled={total}
                onChange={(e) =>
                  settlementPatch({
                    currency: e.target.value,
                    ...(draft.quoteSuggestion
                      ? { price: '', quoteSuggestion: false, priceConfirmed: true }
                      : {}),
                  })
                }
              >
                <option value="">Choose</option>
                {tradeCurrencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          {today && latest != null && quote?.status !== 'stale' && quote?.currency === draft.currency && (
            <div className="text-xs text-muted-foreground">
              Latest quote: {unitPrice(latest, quote.currency, hidden)} ·{' '}
              {quote.as_of ?? 'source time unavailable'}{' '}
              <button
                type="button"
                className="min-h-9 text-primary underline"
                onClick={() =>
                  settlementPatch({
                    price: draftNumber(latest),
                    priceConfirmed: false,
                    quoteSuggestion: true,
                  })
                }
              >
                Use as draft
              </button>
            </div>
          )}
          {!draft.priceConfirmed && (
            <Label className="flex min-h-10 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.priceConfirmed}
                onChange={(e) => patch({ priceConfirmed: e.target.checked })}
              />
              I confirm this is my actual execution price.
            </Label>
          )}
          {!today && (
            <p className="text-xs text-muted-foreground">
              Enter the historical execution from your records. Today's quote is not a past fill.
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="trade-cash-account">{draft.type === 'buy' ? 'Pay from' : 'Deposit to'}</Label>
            <Select
              id="trade-cash-account"
              value={draft.cash}
              onChange={(e) => settlementPatch({ cash: e.target.value, cashAmount: '', fee: '' })}
            >
              <option value="">Choose cash account</option>
              {cashAccounts
                .filter((a) => a.id === draft.cash || (!a.is_locked && a.archived_at == null))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="trade-fee-state">Included fee</Label>
              <Select
                id="trade-fee-state"
                value={draft.feeStatus}
                onChange={(e) => settlementPatch({ feeStatus: e.target.value as 'known' | 'unknown' })}
              >
                <option value="known">Known amount</option>
                <option value="unknown">Breakdown unknown</option>
              </Select>
            </div>
            {draft.feeStatus === 'known' && (
              <div className="space-y-1">
                <Label htmlFor="trade-fee">Fee ({cash?.currency ?? 'cash currency'})</Label>
                <AmountInput
                  id="trade-fee"
                  value={display(draft.fee)}
                  placeholder="Enter 0 if none"
                  onValueChange={(fee) => settlementPatch({ fee })}
                  required
                />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="trade-cash">
              Actual cash {draft.type === 'buy' ? 'paid' : 'received'} ({cash?.currency ?? 'cash currency'})
            </Label>
            <AmountInput
              id="trade-cash"
              value={display(draft.cashAmount)}
              onValueChange={(cashAmount) => settlementPatch({ cashAmount })}
              required
            />
          </div>
          {cash && draft.currency === cash.currency && calculated !== null && calculated >= 0 && (
            <button
              type="button"
              className="min-h-10 text-xs text-primary underline"
              onClick={() => patch({ cashAmount: draftNumber(calculated) })}
            >
              Use calculated total: {amount(calculated, cash.currency, hidden)}
            </button>
          )}
          {cash && draft.currency !== cash.currency && (
            <>
              <p className="text-xs text-muted-foreground">
                {today && cashSuggestion !== null
                  ? `Market FX estimate: ${amount(cashSuggestion, cash.currency, hidden)}. `
                  : ''}
                Enter your actual settlement. Market FX does not establish fees or execution cash.
              </p>
              <Label className="flex min-h-10 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.cashConfirmed}
                  onChange={(e) => patch({ cashConfirmed: e.target.checked })}
                />
                I confirm this is the actual cash settlement, including fees.
              </Label>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Fees are already included in actual cash and create no extra expense. Prices and units support 12
            decimal places; settlement cash supports two.
          </p>
          <div className="space-y-1">
            <Label htmlFor="trade-note">Note (optional)</Label>
            <Input
              id="trade-note"
              value={display(draft.notes)}
              maxLength={500}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>
          <section
            aria-label="Exact trade totals"
            className="space-y-1 rounded-xl border border-border bg-background p-3 text-sm"
          >
            <p>Gross execution: {unitPrice(gross, draft.currency, hidden)}</p>
            <p>
              {draft.type === 'buy' ? 'Cash paid' : 'Cash received'}:{' '}
              {amount(parseAmount(draft.cashAmount), cash?.currency ?? '', hidden)}
            </p>
            {serverPosition !== null && (
              <p>
                Position after: {hidden ? '••••••' : draftNumber(serverPosition)}{' '}
                {total ? 'ITEM' : holding?.currency}
              </p>
            )}
            {serverCash !== null && (
              <p>Cash balance after: {amount(serverCash, cash?.currency ?? '', hidden)}</p>
            )}
          </section>
          {serverCash !== null && serverCash < 0 && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              Amount exceeds the available cash balance. This is a warning; the app permits a negative cash
              balance.
            </p>
          )}
          {!recovering && validation.error && (
            <p className="text-xs text-muted-foreground">{validation.error}</p>
          )}
          {recovering && (
            <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
              {retryExpired
                ? 'The 24-hour retry window has expired. Review trade history before starting a new trade.'
                : failedSave?.uncertain
                  ? 'The previous save outcome is unconfirmed. Editing is paused while you retry the original request to recover its result or apply it once.'
                  : 'The previous save was rejected. Retry the original request or correct its details; your draft and request key are preserved.'}
            </p>
          )}
          <TradeMetricsPreview
            input={recovering ? null : validation.input}
            tradeId={edit?.trade.id}
            hidden={hidden}
            currency={currency}
            refreshKey={sourceRevision}
            onStatus={onStatus}
          />
          {!recovering && preview?.key === signature && preview.error && (
            <p role="alert" className="text-sm text-destructive">
              {preview.error}
            </p>
          )}
        </fieldset>
        {hidden && (
          <p className="px-5 pb-3 text-xs text-muted-foreground">Reveal values to edit or save this trade.</p>
        )}
        {(busy || error) && (
          <p
            ref={feedback}
            tabIndex={-1}
            role={error ? 'alert' : 'status'}
            className={`px-5 pb-3 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {error ?? 'Processing linked trade…'}
          </p>
        )}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card p-4">
          {edit && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={busy || hidden || !!recovering}
              onClick={() => {
                void remove()
              }}
            >
              Delete trade
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !ready}>
            {busy
              ? 'Processing…'
              : recovering
                ? 'Retry original save'
                : edit
                  ? 'Save changes'
                  : draft.type === 'buy'
                    ? 'Record purchase'
                    : 'Record sale'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
