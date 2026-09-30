import { Button } from './button'

// Currency codes only: never expose account names, amounts, or payload errors.
export function MissingExchangeRates({ currencies, targetCurrency, onRetry, retrying = false }: {
  currencies: string[]
  targetCurrency: string
  onRetry?: () => void
  retrying?: boolean
}) {
  if (!currencies.length) return null
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">Converted totals unavailable</p>
          <p className="mt-1 text-muted-foreground">
            Missing or invalid exchange rates: {currencies.join(', ')} (reporting currency: {targetCurrency}).
            {' '}Affected totals and charts are unavailable. Original-currency values remain available.
          </p>
        </div>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying rates…' : 'Retry rates'}
        </Button>}
      </div>
    </div>
  )
}
