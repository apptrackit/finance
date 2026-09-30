import type { ReactNode } from 'react'
import type { DataLoadStatus } from '../../hooks/useLoadableData'
import { Button } from './button'

export type NamedDataStatus = { label: string; status: DataLoadStatus }

export function FinanceDataStatus({ datasets, onRetry }: { datasets: NamedDataStatus[]; onRetry: () => void }) {
  const failures = datasets.filter(({ status }) => status.error)
  if (failures.length === 0) return null
  const retrying = failures.some(({ status }) => status.loading)

  return (
    <div role="alert" className="mb-4 rounded-xl border border-destructive/40 bg-card p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Some financial data could not be loaded.</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {failures.map(({ label, status }) => (
              <li key={label}>{label}: {status.stale ? 'Showing previously loaded data. It may be out of date or from a different period.' : 'Unavailable.'}</li>
            ))}
          </ul>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    </div>
  )
}

// A failed first load must never reach a child's normal empty state or totals.
// A refresh keeps mounted views and form drafts intact.
export function FinanceDataBoundary({ label, datasets, children }: { label: string; datasets: NamedDataStatus[]; children: ReactNode }) {
  const missing = datasets.filter(({ status }) => !status.loaded)
  if (missing.length === 0) return children
  const failed = missing.some(({ status }) => status.error)
  return (
    <div role="status" className="rounded-xl border border-border/50 bg-card p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1">{failed ? 'Data unavailable.' : 'Loading…'}</p>
    </div>
  )
}
