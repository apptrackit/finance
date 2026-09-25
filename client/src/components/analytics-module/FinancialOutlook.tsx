import { BrainCircuit, CalendarClock, Check, RefreshCw, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Account, FinancialOutlookRange, FinancialOutlookSnapshot, Transaction } from './types'
import { AICashOutlookChart } from './AICashOutlookChart'

type FinancialOutlookProps = {
  snapshot: FinancialOutlookSnapshot | null
  history: FinancialOutlookSnapshot[]
  selectedId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onLoadMore: () => void
  hasMore: boolean
  transactions: Transaction[]
  accounts: Account[]
  convertToHuf: (amount: number, accountId: string) => number | null
}

const STATUS_COPY = {
  up_to_date: { label: 'Up to date', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  data_changed: { label: 'Needs refresh', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  refresh_recommended: { label: 'Refresh recommended', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  partially_expired: { label: 'Partially expired', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  historical: { label: 'Historical', className: 'bg-muted text-muted-foreground' },
} as const

function amount(value: number, currency: string, hidden: boolean) {
  if (hidden) return '••••••'
  return `${value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${currency}`
}

function CashProjection({ days, range, currency, hidden, expired, checkedAt }: { days: number; range: FinancialOutlookRange; currency: string; hidden: boolean; expired: boolean; checkedAt: Date }) {
  const date = new Date(checkedAt)
  date.setDate(date.getDate() + days)

  return (
    <div className={`rounded-lg border p-3 ${expired ? 'border-border/50 bg-muted/25 opacity-70' : 'border-primary/20 bg-background/50'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-medium">In {days} days</p>
          <p className="text-xs text-muted-foreground">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{expired ? ' · expired' : ''}</p>
        </div>
        <div className={`min-w-0 text-right ${hidden ? 'select-none' : ''}`}>
          <p className="font-semibold">{amount(range.expected, currency, hidden)}</p>
          <p className="text-xs text-muted-foreground">{amount(range.low, currency, hidden)} – {amount(range.high, currency, hidden)}</p>
        </div>
      </div>
    </div>
  )
}

export function FinancialOutlook({ snapshot, history, selectedId, loading = false, onSelect, onLoadMore, hasMore, transactions, accounts, convertToHuf }: FinancialOutlookProps) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'

  if (loading && !snapshot) {
    return <Card className="animate-pulse"><CardContent className="py-16"><div className="h-24 rounded-lg bg-muted/60" /></CardContent></Card>
  }

  if (!snapshot) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardContent className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><BrainCircuit className="h-5 w-5 text-primary" /></div>
          <p className="font-semibold">AI Financial Forecast</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Ask your connected AI assistant to analyze your finances and publish your first forecast.</p>
        </CardContent>
      </Card>
    )
  }

  const status = STATUS_COPY[snapshot.freshness.status]
  const checkedAt = new Date(snapshot.source_queried_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const checkedAtDate = new Date(snapshot.source_queried_at)

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-card">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
            <div>
              <CardTitle className="text-base">AI Financial Forecast</CardTitle>
              <p className={`mt-1 text-sm text-muted-foreground ${hidden ? 'select-none tracking-[0.12em]' : ''}`}>
                {hidden ? '••••••••••••••••••••••••••••••••••••' : snapshot.headline}
              </p>
            </div>
          </div>
          {history.length > 1 && (
            <select aria-label="Select forecast report" value={selectedId || snapshot.id} onChange={event => onSelect(event.target.value)} className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
              {history.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${status.className}`}>{snapshot.freshness.status === 'up_to_date' && <Check className="h-3 w-3" />}{status.label}</span>
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Data checked {checkedAt}</span>
        </div>
        {snapshot.freshness.data_changed && <p className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><RefreshCw className="h-3.5 w-3.5" />Your financial data changed after this forecast was generated.</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Projected cash</p>
          <div className="grid gap-2 md:grid-cols-3">
            {snapshot.horizons.map(horizon => {
              const expired = snapshot.freshness.expired_horizons.includes(horizon.days)
              return (
                <CashProjection key={horizon.days} days={horizon.days} range={horizon.cash_balance} currency={snapshot.currency} hidden={hidden} expired={expired} checkedAt={checkedAtDate} />
              )
            })}
          </div>
        </div>

        {hasMore && <button onClick={onLoadMore} className="text-xs font-medium text-primary hover:underline">Load older forecasts</button>}
        <AICashOutlookChart snapshot={snapshot} transactions={transactions} accounts={accounts} convertToHuf={convertToHuf} />
        {(snapshot.drivers.length > 0 || snapshot.risks.length > 0 || snapshot.assumptions.length > 0 || snapshot.suggestions.length > 0) && (
          <details className="border-t border-border/60 pt-3">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Forecast details</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {snapshot.drivers.length > 0 && <Notes title="What is driving this" items={snapshot.drivers} hidden={hidden} />}
              {snapshot.risks.length > 0 && <Notes title="Risks to watch" items={snapshot.risks} hidden={hidden} tone="risk" />}
              {snapshot.assumptions.length > 0 && <Notes title="Assumptions" items={snapshot.assumptions} hidden={hidden} />}
              {snapshot.suggestions.length > 0 && <Notes title="Suggestions" items={snapshot.suggestions} hidden={hidden} />}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function Notes({ title, items, hidden, tone }: { title: string; items: string[]; hidden: boolean; tone?: 'risk' }) {
  return (
    <div>
      <p className={`text-sm font-medium ${tone === 'risk' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{title}</p>
      <ul className={`mt-1.5 space-y-1 text-sm text-muted-foreground ${hidden ? 'select-none tracking-[0.12em]' : ''}`}>
        {items.map((item, index) => <li key={hidden ? `${title}-${index}` : item}>• {hidden ? '••••••••••••••••••••••••' : item}</li>)}
      </ul>
    </div>
  )
}
