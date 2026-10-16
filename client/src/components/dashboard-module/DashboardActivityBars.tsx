import { Fragment } from 'react'
import { formatCalculatedAmount } from '../../lib/amount'

type DashboardActivityBarsProps = {
  periodLabel: string
  daysLeft: number | null
  income: number | null
  expenses: number | null
  pendingIncome: number | null
  pendingExpenses: number | null
  upcomingLoaded: boolean
  currency: string
  hidden: boolean
}

export function DashboardActivityBars({ periodLabel, daysLeft, income, expenses, pendingIncome, pendingExpenses, upcomingLoaded, currency, hidden }: DashboardActivityBarsProps) {
  const upcomingAvailable = upcomingLoaded && pendingIncome !== null && pendingExpenses !== null
  const scale = income === null || expenses === null ? null : Math.max(
    income + (upcomingAvailable ? pendingIncome : 0),
    expenses + (upcomingAvailable ? pendingExpenses : 0),
  ) || 1
  const width = (value: number) => hidden || scale === null ? 0 : Math.max(0, Math.min(100, value / scale * 100))
  const amount = (value: number | null) => value === null ? 'Unavailable' : hidden ? '••••••' : formatCalculatedAmount(value, { maximumFractionDigits: 0 })
  const signed = (value: number | null) => value === null ? 'Unavailable' : hidden ? '••••••' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${amount(Math.abs(value))}`
  const ratio = income !== null && expenses !== null && income > 0 ? expenses / income * 100 : null
  const leftover = income !== null && expenses !== null ? income - expenses : null
  const rows = [
    { key: 'income', label: 'Income', value: income, upcoming: pendingIncome, sign: 1, color: 'text-success' },
    { key: 'expense', label: 'Expense', value: expenses, upcoming: pendingExpenses, sign: -1, color: 'text-destructive' },
  ] as const

  return <>
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <h2 className="font-medium">{periodLabel}</h2>
        {daysLeft !== null && <span>· {daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 tabular-nums">
        <span>{hidden ? '••%' : ratio === null ? 'Ratio unavailable' : `${Math.round(ratio)}% of income spent`}</span>
        <span aria-hidden="true">·</span>
        <span><span className="font-medium">{amount(leftover)} {currency}</span> left over</span>
      </div>
    </div>
    <div className="dashboard-cash-flow-grid tabular-nums">
      {rows.map(row => <Fragment key={row.key}>
        <span className="text-[13px] text-muted-foreground">{row.label}</span>
        <span className={`whitespace-nowrap text-right text-base font-semibold ${row.value === null ? 'text-muted-foreground' : row.color}`}>
          {signed(row.value === null ? null : row.value * row.sign)} <span className="text-xs font-normal text-muted-foreground">{currency}</span>
        </span>
        <div className={`dashboard-cash-flow-bar dashboard-cash-flow-${row.key}`} aria-hidden="true">
          <div data-testid={`${row.key}-posted-bar`} className="dashboard-cash-flow-posted" style={{ width: `${width(row.value ?? 0)}%` }} />
          <div data-testid={`${row.key}-upcoming-bar`} className="dashboard-cash-flow-pending" style={{ width: `${width(upcomingAvailable ? row.upcoming ?? 0 : 0)}%` }} />
        </div>
        <span className={`dashboard-cash-flow-upcoming whitespace-nowrap text-right text-xs text-muted-foreground ${upcomingLoaded && row.upcoming === 0 ? 'dashboard-cash-flow-empty' : ''}`}>
          {!upcomingLoaded || row.upcoming === null ? 'Upcoming unavailable' : row.upcoming > 0 ? `${signed(row.upcoming * row.sign)} upcoming` : null}
        </span>
      </Fragment>)}
    </div>
  </>
}
