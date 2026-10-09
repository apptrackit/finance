import { BrainCircuit, ChevronRight, ListChecks, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { addDays, format, startOfDay } from 'date-fns'
import { Card, CardContent } from '../common/card'
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
  up_to_date: { label: 'Up to date', className: 'bg-success' },
  data_changed: { label: 'Needs refresh', className: 'bg-amber-500' },
  refresh_recommended: { label: 'Refresh recommended', className: 'bg-amber-500' },
  partially_expired: { label: 'Partially expired', className: 'bg-orange-500' },
  historical: { label: 'Historical', className: 'bg-muted-foreground' },
} as const

function amount(value: number, hidden: boolean) {
  return hidden ? '••••••' : value.toLocaleString('hu-HU', { maximumFractionDigits: 0 })
}

function CashProjection({ days, range, baseline, hidden, expired, generationDay, domain }: {
  days: number; range: FinancialOutlookRange; baseline: number | undefined; hidden: boolean; expired: boolean; generationDay: Date; domain: [number, number]
}) {
  const delta = baseline === undefined ? undefined : range.expected - baseline
  const span = domain[1] - domain[0]
  const position = (value: number) => span > 0 ? Math.max(0, Math.min(100, (value - domain[0]) / span * 100)) : 50

  return (
    <div className={`min-w-0 p-5 sm:px-6 ${expired ? 'bg-muted/25' : ''}`}>
      <p className="text-xs font-medium text-muted-foreground">In {days} days · {format(addDays(generationDay, days), 'MMM d')}{expired ? ' · expired' : ''}</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
        <p className="text-2xl font-bold tracking-tight">{amount(range.expected, hidden)}</p>
        {delta !== undefined && <p className={`text-xs font-semibold ${hidden ? 'select-none text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-orange-700 dark:text-orange-300'}`}>
          <span className="sr-only">Change from generation day: </span>{hidden ? '••••••' : `${delta >= 0 ? '+' : '−'}${amount(Math.abs(delta), false)}`}
        </p>}
      </div>
      <div aria-hidden="true" className="relative mb-2 mt-4 h-1.5 rounded-full bg-border">
        {!hidden && <>
          <div className="absolute inset-y-0 rounded-full bg-forecast/35" style={{ left: `${position(range.low)}%`, width: `${position(range.high) - position(range.low)}%` }} />
          <div className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-forecast" style={{ left: `${position(range.expected)}%` }} />
        </>}
      </div>
      <p className="flex justify-between gap-2 text-[11px] tabular-nums text-muted-foreground"><span><span className="sr-only">Low: </span>{amount(range.low, hidden)}</span><span><span className="sr-only">High: </span>{amount(range.high, hidden)}</span></p>
    </div>
  )
}

export function FinancialOutlook({ snapshot, history, selectedId, loading = false, onSelect, onLoadMore, hasMore, transactions, accounts, convertToHuf }: FinancialOutlookProps) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'

  if (loading && !snapshot) {
    return <Card role="status" aria-label="Loading AI financial forecast" className="animate-pulse"><CardContent className="py-16"><div className="h-24 rounded-lg bg-muted/60" /></CardContent></Card>
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-forecast/10"><BrainCircuit className="h-5 w-5 text-forecast" /></div>
          <p className="font-semibold">AI Financial Forecast</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Ask your connected AI assistant to analyze your finances and publish your first forecast.</p>
        </CardContent>
      </Card>
    )
  }

  const status = STATUS_COPY[snapshot.freshness.status]
  // The saved forecast uses the source query's UTC calendar day, as does its chart.
  const generationDay = startOfDay(new Date(`${snapshot.source_queried_at.slice(0, 10)}T12:00:00`))
  const checkedAt = new Date(snapshot.source_queried_at)
  const baseline = snapshot.cash_balance_path.find(point => point.day === 0)?.expected
  const values = snapshot.horizons.flatMap(horizon => [horizon.cash_balance.low, horizon.cash_balance.high])
  const domain: [number, number] = [Math.min(...values), Math.max(...values)]
  const isToday = format(generationDay, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  const reports = history.some(item => item.id === snapshot.id) ? history : [snapshot, ...history]

  return (
    <Card className="overflow-hidden rounded-2xl">
      <header className="border-b border-border p-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1 basis-80">
            <p className="flex items-center gap-2.5 text-[13px] font-semibold text-muted-foreground"><Sparkles className="h-4 w-4 text-forecast" />AI Financial Forecast</p>
            <h2 className={`mt-2 max-w-3xl text-xl font-semibold leading-snug tracking-tight sm:text-[22px] ${hidden ? 'select-none' : ''}`}>
              {hidden ? '••••••••••••••••••••••••' : snapshot.headline}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.className}`} /><span className="font-medium text-foreground">{status.label}</span>
              <span title={checkedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}>· checked {checkedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            </p>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <span className="text-muted-foreground">Generated</span>
              <select aria-label="Select forecast report" value={selectedId || snapshot.id} onChange={event => onSelect(event.target.value)} disabled={loading} className="min-w-0 bg-background font-medium text-foreground">
                {reports.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', ...(reports.filter(report => report.created_at.slice(0, 10) === item.created_at.slice(0, 10)).length > 1 ? { timeStyle: 'short' as const } : {}) })}</option>)}
              </select>
            </label>
            {hasMore && <button type="button" disabled={loading} onClick={onLoadMore} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">{loading ? 'Loading…' : 'Load older forecasts'}</button>}
          </div>
        </div>
        {snapshot.freshness.data_changed && <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><RefreshCw className="h-3.5 w-3.5 shrink-0" />Your financial data changed after this forecast was generated.</p>}
      </header>

      <section aria-label={`Projected cash in ${snapshot.currency}`} className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 [&>div]:sm:border-r [&>div]:sm:border-border [&>div:last-child]:border-r-0">
        <div className="min-w-0 p-5 sm:px-7">
          <p className="text-xs font-medium text-muted-foreground">{isToday ? 'Today' : 'At generation'} · {format(generationDay, 'MMM d')}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{baseline === undefined ? 'Unavailable' : amount(baseline, hidden)} <span className="text-sm font-semibold text-muted-foreground">{snapshot.currency}</span></p>
          <p className="mt-1.5 text-xs text-muted-foreground">Liquid cash at generation</p>
        </div>
        {snapshot.horizons.map(horizon => <CashProjection key={horizon.days} days={horizon.days} range={horizon.cash_balance} baseline={baseline} hidden={hidden} expired={snapshot.freshness.expired_horizons.includes(horizon.days)} generationDay={generationDay} domain={domain} />)}
      </section>

      <AICashOutlookChart snapshot={snapshot} transactions={transactions} accounts={accounts} convertToHuf={convertToHuf} />

      {(snapshot.risks.length > 0 || snapshot.suggestions.length > 0) && <section className={`grid border-t border-border ${snapshot.risks.length > 0 && snapshot.suggestions.length > 0 ? 'md:grid-cols-2' : ''}`}>
        {snapshot.risks.length > 0 && <div className={`p-5 sm:px-7 sm:py-6 ${snapshot.suggestions.length > 0 ? 'md:border-r md:border-border' : ''}`}>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" />Risks to watch</h3>
          <ul className="mt-3 space-y-2.5">{snapshot.risks.map((risk, index) => <li key={index} className="flex gap-2.5 text-sm leading-relaxed"><span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" /><span className={hidden ? 'select-none' : ''}>{hidden ? '••••••••••••••••••••••••' : risk}</span></li>)}</ul>
        </div>}
        {snapshot.suggestions.length > 0 && <div className={`p-5 sm:px-7 sm:py-6 ${snapshot.risks.length > 0 ? 'border-t border-border md:border-t-0' : ''}`}>
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" />Suggestions <span className="text-xs font-normal text-muted-foreground">to tighten the range</span></h3>
          <ul className="mt-3 space-y-2">{snapshot.suggestions.map((suggestion, index) => <li key={index} className={`rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed ${hidden ? 'select-none' : ''}`}>{hidden ? '••••••••••••••••••••••••' : suggestion}</li>)}</ul>
        </div>}
      </section>}

      {(snapshot.drivers.length > 0 || snapshot.assumptions.length > 0) && <details className="group border-t border-border">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 p-5 text-sm font-semibold hover:bg-muted/40 sm:px-7 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />How this forecast was built
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">{snapshot.drivers.length} drivers · {snapshot.assumptions.length} assumptions</span>
        </summary>
        <div className="grid gap-6 px-5 pb-6 sm:pl-14 sm:pr-7 md:grid-cols-2">
          {snapshot.drivers.length > 0 && <Notes title="What is driving this" items={snapshot.drivers} hidden={hidden} />}
          {snapshot.assumptions.length > 0 && <Notes title="Assumptions" items={snapshot.assumptions} hidden={hidden} />}
        </div>
      </details>}
    </Card>
  )
}

function Notes({ title, items, hidden }: { title: string; items: string[]; hidden: boolean }) {
  return <div>
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    <ul className={`mt-2.5 space-y-2 text-[13px] leading-relaxed text-muted-foreground ${hidden ? 'select-none' : ''}`}>
      {items.map((item, index) => <li key={index}>{hidden ? '••••••••••••••••••••••••' : item}</li>)}
    </ul>
  </div>
}
