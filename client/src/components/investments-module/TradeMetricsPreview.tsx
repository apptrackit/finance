import { useEffect, useState } from 'react'
import { API_BASE_URL, apiFetch, ApiRequestError } from '../../config'
import type { TradeInput } from '../../../../shared/investment-trade'
import type { InvestmentMetricsSnapshot } from '../../../../shared/investment-metrics'
import { amount, costPrice } from './overview'
export const tradePreviewKey = (
  input: Omit<TradeInput, 'idempotency_key'> | null,
  tradeId?: string,
  refreshKey?: string | number,
) => JSON.stringify([input, tradeId, refreshKey])
export type PreviewStatus = {
  key: string
  ready: boolean
  error?: string
  position?: number | null
  cashAfter?: { account_id: string; currency: string; balance: number }
}
type PreviewResponse = InvestmentMetricsSnapshot & {
  preview_trade_id: string
  preview_cash_after?: PreviewStatus['cashAfter']
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finiteOrNull = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value))
function validPreview(value: unknown): value is PreviewResponse {
  if (!record(value) || typeof value.preview_trade_id !== 'string' || !record(value.by_currency)) return false
  for (const currency of ['HUF', 'USD']) {
    const ledger = value.by_currency[currency]
    if (
      !record(ledger) ||
      !Array.isArray(ledger.holdings) ||
      !ledger.holdings.every(
        (h) =>
          record(h) &&
          typeof h.account_id === 'string' &&
          typeof h.native_currency === 'string' &&
          finiteOrNull(h.quantity) &&
          finiteOrNull(h.remaining_basis) &&
          record(h.native) &&
          finiteOrNull(h.native.average_cost) &&
          record(h.trade_realized) &&
          Object.values(h.trade_realized).every(finiteOrNull),
      )
    )
      return false
  }
  const cash = value.preview_cash_after
  return (
    cash === undefined ||
    (record(cash) &&
      typeof cash.account_id === 'string' &&
      typeof cash.currency === 'string' &&
      typeof cash.balance === 'number' &&
      Number.isFinite(cash.balance))
  )
}
export function TradeMetricsPreview({
  input,
  tradeId,
  hidden,
  currency = 'HUF',
  onStatus,
  refreshKey,
}: {
  input: Omit<TradeInput, 'idempotency_key'> | null
  tradeId?: string
  hidden: boolean
  currency?: string
  refreshKey?: string | number
  onStatus?: (status: PreviewStatus) => void
}) {
  const key = tradePreviewKey(input, tradeId, refreshKey)
  const [state, setState] = useState<{ key: string; data?: PreviewResponse; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const [draft, target] = JSON.parse(key) as [
      Omit<TradeInput, 'idempotency_key'> | null,
      string | undefined,
    ]
    if (!draft) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void apiFetch(
        `${API_BASE_URL}/investment-trades/preview${target ? `?trade_id=${encodeURIComponent(target)}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ ...draft, idempotency_key: crypto.randomUUID() }),
          throwOnError: true,
        },
      )
        .then((response) => response.json())
        .then((data) => {
          if (!validPreview(data)) throw new Error('Invalid trade preview')
          if (!controller.signal.aborted) setState({ key, data })
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              key,
              error:
                error instanceof ApiRequestError
                  ? error.message
                  : 'Preview unavailable. Check the details and retry.',
            })
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, retry])
  const result = state?.key === key ? state : null
  const metric = result?.data?.by_currency[currency]?.holdings.find(
    (h) => h.account_id === input?.holding_account_id,
  )
  const cashAfter = result?.data?.preview_cash_after
  useEffect(() => {
    onStatus?.({ key, ready: !!metric, error: result?.error, cashAfter, position: metric?.quantity })
  }, [key, metric, result?.error, cashAfter, onStatus])
  if (!input) return null
  const show = (value: number | null | undefined, currency: string) =>
    hidden ? '••••••' : amount(value ?? null, currency)
  return (
    <section
      aria-label="Trade accounting preview"
      className="rounded-xl border border-border p-3 text-sm space-y-1"
      role="status"
    >
      <h4 className="font-medium">After this trade · estimate</h4>
      {!metric ? (
        <p className="text-muted-foreground">
          {result?.error
            ? 'Preview unavailable. Check trade details or retry; your draft is preserved.'
            : 'Calculating position and cost…'}
          {result?.error && (
            <button
              type="button"
              className="ml-2 min-h-10 text-primary underline"
              onClick={() => {
                setState(null)
                setRetry((n) => n + 1)
              }}
            >
              Retry preview
            </button>
          )}
        </p>
      ) : (
        <>
          <p>
            Position:{' '}
            {hidden
              ? '••••••'
              : (metric.quantity?.toLocaleString(undefined, { maximumFractionDigits: 12 }) ??
                'Unavailable')}{' '}
            units
          </p>
          <p>
            Average remaining cost: {costPrice(metric.native.average_cost, metric.native_currency, hidden)}
          </p>
          <p>Remaining basis: {show(metric.remaining_basis, currency)}</p>
          {input.type === 'sell' && (
            <p>
              Estimated gain on this sale:{' '}
              {show(metric.trade_realized[result!.data!.preview_trade_id], currency)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Uses the saved accounting rules and dated FX. Excludes dividends. Unknown opening cost stays unavailable. Saving
            revalidates both accounts and the complete trade timeline.
          </p>
          <button
            type="button"
            className="min-h-10 text-xs text-primary underline"
            onClick={() => {
              setState(null)
              setRetry((n) => n + 1)
            }}
          >
            Refresh preview
          </button>
        </>
      )}
    </section>
  )
}
