import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  LegacyDetails,
  LegacyDetailsInput,
} from '../../../../shared/legacy-investment-details'
import {
  tradeCurrencies,
  roundSettlement,
} from '../../../../shared/investment-trade'
import { API_BASE_URL, apiFetch } from '../../config'
import { useAlert } from '../../context/AlertContext'
import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { formatAmount, parseAmount } from '../../lib/amount'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { AmountInput } from '../common/amount-input'
import { Select } from '../common/select'
import { Label } from '../common/label'
import { amount, unitPrice } from './overview'
export function LegacyTradeDetails({
  tradeId,
  hidden,
  onClose,
  onSaved,
}: {
  tradeId: string
  hidden: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { confirm, showAlert } = useAlert()
  const [data, setData] = useState<LegacyDetails | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [execution, setExecution] = useState(''),
    [currency, setCurrency] = useState(''),
    [cash, setCash] = useState(''),
    [feeStatus, setFeeStatus] = useState<'known' | 'unknown'>('unknown'),
    [fee, setFee] = useState('')
  const busyRef = useRef(false),
    feedback = useRef<HTMLParagraphElement | null>(null)
  const dirty = !!(
    execution ||
    currency ||
    cash ||
    fee ||
    feeStatus === 'known'
  )
  useUnsavedChanges(dirty || busy)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/investment-trades/${encodeURIComponent(tradeId)}/legacy-details`,
          { throwOnError: true, signal: controller.signal },
        )
        const value = (await response.json()) as LegacyDetails
        if (
          value.trade?.id !== tradeId ||
          !Number.isSafeInteger(value.trade.trade_version) ||
          !value.account
        )
          throw new Error('Invalid historical trade details')
        if (!controller.signal.aborted) {
          setData(value)
          setExecution(value.trade.execution_currency ?? '')
          setCurrency(value.trade.cash_currency ?? '')
          setCash(
            value.trade.cash_amount == null
              ? ''
              : formatAmount(value.trade.cash_amount),
          )
          setFeeStatus(value.trade.fee_status ?? 'unknown')
          setFee(
            value.trade.fee_amount == null
              ? ''
              : formatAmount(value.trade.fee_amount),
          )
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : 'Could not read historical details',
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [tradeId])
  useEffect(() => {
    if (error) feedback.current?.focus()
  }, [error])
  const close = async () => {
    if (busyRef.current) return
    if (
      !dirty ||
      (await confirm({
        title: 'Discard historical details?',
        message: 'Your unsaved details will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      }))
    )
      onClose()
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (busyRef.current || !data || hidden) return
    const paid = parseAmount(cash),
      includedFee = feeStatus === 'known' ? parseAmount(fee) : null
    if (
      !execution ||
      !currency ||
      paid === null ||
      paid <= 0 ||
      (feeStatus === 'known' && (includedFee === null || includedFee < 0))
    ) {
      setError(
        'Confirm both currencies, the total paid/received and any known included fee.',
      )
      return
    }
    const body: LegacyDetailsInput = {
      expected_version: data.trade.trade_version!,
      execution_currency: execution,
      cash_currency: currency,
      cash_amount: paid,
      fee_status: feeStatus,
      fee_amount: includedFee,
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      if (
        !(await confirm({
          title: 'Confirm historical payment details?',
          message: `${data.trade.type === 'buy' ? 'Paid' : 'Received'} ${amount(paid, currency)} on ${data.trade.date}. This records historical facts only. Cash balances, holding units and the original purchase/sale stay unchanged.`,
          confirmText: 'Confirm details',
          cancelText: 'Keep editing',
        }))
      )
        return
      await apiFetch(
        `${API_BASE_URL}/investment-trades/${encodeURIComponent(tradeId)}/legacy-details`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      showAlert({
        type: 'success',
        message:
          'Historical details saved. Cash and holding balances are unchanged.',
      })
      await onSaved().catch(() =>
        showAlert({
          type: 'warning',
          message: 'Details saved. Refresh the page to reload calculations.',
        }),
      )
      onClose()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save historical details',
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const protectedAccount =
    !!data?.account.is_locked || data?.account.archived_at != null
  const currencies = (
    id: string,
    label: string,
    value: string,
    change: (s: string) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value}
        onChange={(e) => change(e.target.value)}
        required
      >
        <option value="">Confirm currency</option>
        {tradeCurrencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </div>
  )
  return (
    <Modal
      isOpen
      onClose={() => {
        void close()
      }}
      title="Confirm historical trade details"
      subtitle={data?.account.name}
      placement="center"
      className="max-h-[94dvh] sm:max-w-[520px]"
      contentClassName="overflow-y-auto"
    >
      <form
        onSubmit={save}
        className="space-y-4"
        aria-label="Historical trade details"
      >
        <p className="text-xs text-muted-foreground">
          Complete an existing purchase or sale. This does not create a cash
          transaction, change balances or record another trade.
        </p>
        {loading && <p role="status">Reading saved trade…</p>}
        {error && (
          <p
            role="alert"
            tabIndex={-1}
            ref={feedback}
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {hidden ? (
          <p>Show investment values to confirm historical details.</p>
        ) : (
          data && (
            <>
              <dl className="rounded-lg border border-border bg-secondary p-3 text-sm">
                <dt>
                  Saved {data.trade.type} · {data.trade.date}
                </dt>
                <dd className="mt-1 tabular-nums">
                  {formatAmount(data.trade.quantity, {
                    maximumFractionDigits: 12,
                  })}{' '}
                  {data.account.currency} @{' '}
                  {unitPrice(
                    data.trade.price,
                    data.trade.execution_currency ?? 'currency unconfirmed',
                  )}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  Date, units and price remain unchanged.
                </dd>
              </dl>
              {protectedAccount && (
                <p className="text-sm text-muted-foreground">
                  Unlock or restore this holding before confirming its details.
                </p>
              )}
              <fieldset
                disabled={busy || protectedAccount}
                className="space-y-4"
              >
                {currencies(
                  'legacy-execution',
                  'Purchase/sale price currency',
                  execution,
                  setExecution,
                )}
                {currencies(
                  'legacy-cash-currency',
                  'Actual payment currency',
                  currency,
                  setCurrency,
                )}
                <div className="space-y-1">
                  <Label htmlFor="legacy-cash">
                    Total {data.trade.type === 'buy' ? 'paid' : 'received'}{' '}
                    (including fees)
                  </Label>
                  <AmountInput
                    id="legacy-cash"
                    value={cash}
                    onValueChange={setCash}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the actual historical amount from your records.
                  </p>
                  {execution && currency === execution && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCash(
                          formatAmount(
                            roundSettlement(
                              data.trade.quantity * data.trade.price,
                            ),
                          ),
                        )
                      }
                    >
                      Use rounded trade total before fees
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="legacy-fee-status">
                    Included fee breakdown
                  </Label>
                  <Select
                    id="legacy-fee-status"
                    value={feeStatus}
                    onChange={(e) =>
                      setFeeStatus(e.target.value as 'known' | 'unknown')
                    }
                  >
                    <option value="unknown">Unknown breakdown</option>
                    <option value="known">
                      I know the included fee (including zero)
                    </option>
                  </Select>
                </div>
                {feeStatus === 'known' && (
                  <div className="space-y-1">
                    <Label htmlFor="legacy-fee">
                      Included fee in payment currency
                    </Label>
                    <AmountInput
                      id="legacy-fee"
                      value={fee}
                      onValueChange={setFee}
                      required
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={!execution || !currency || !cash || busy}
                  className="w-full"
                >
                  {busy ? 'Saving historical details…' : 'Confirm details'}
                </Button>
              </fieldset>
            </>
          )
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void close()
          }}
        >
          Cancel
        </Button>
      </form>
    </Modal>
  )
}
