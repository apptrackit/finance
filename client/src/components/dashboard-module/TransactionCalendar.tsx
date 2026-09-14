import { useEffect, useMemo, useState } from 'react'
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ArrowRightLeft, CalendarDays, TrendingUp } from 'lucide-react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

type Transaction = {
  id: string
  account_id: string
  category_id?: string | null
  amount: number
  description?: string | null
  date: string
  linked_transaction_id?: string
  status?: 'posted' | 'pending' | 'cancelled'
  created_at?: number | null
  updated_at?: number | null
}

type Account = { id: string; name: string; balance: number; currency: string; type: 'cash' | 'investment' }
type CalendarTransaction = Transaction & { relatedTx?: Transaction }
type CalendarChartPoint = { dateKey: string; label: string; balance: number; day: Date }

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')

export function TransactionCalendar({
  transactions,
  accounts,
  currentMonth,
  privacyMode,
  getCategoryName,
  getCategoryIcon,
  getAccountName,
  getAccountCurrency,
  convertToMasterCurrency = (value) => value,
  masterCurrency,
  sortOrder,
}: {
  transactions: Transaction[]
  accounts: Account[]
  currentMonth: Date
  privacyMode: 'visible' | 'hidden'
  getCategoryName: (id?: string | null) => string
  getCategoryIcon: (id?: string | null) => string
  getAccountName: (id: string) => string
  getAccountCurrency: (id: string) => string
  convertToMasterCurrency?: (amount: number, accountId: string) => number
  masterCurrency: string
  sortOrder: 'date' | 'amount-high' | 'amount-low'
}) {
  const [selectedDate, setSelectedDate] = useState(() => startOfMonth(currentMonth))
  const [density, setDensity] = useState<'compact' | 'detailed'>('compact')

  useEffect(() => {
    setSelectedDate(startOfMonth(currentMonth))
  }, [currentMonth])

  const displayTransactions = useMemo(() => {
    const all = transactions
    const byId = new Map(all.map(tx => [tx.id, tx]))
    const hiddenLinkedIds = new Set<string>()

    return all.flatMap(tx => {
      if (!tx.linked_transaction_id) return [tx]
      if (hiddenLinkedIds.has(tx.id)) return []
      const related = byId.get(tx.linked_transaction_id)
      if (!related) return [tx]
      const primary = tx.amount <= related.amount ? tx : related
      const secondary = primary.id === tx.id ? related : tx
      hiddenLinkedIds.add(secondary.id)
      return [{ ...primary, relatedTx: secondary }]
    })
  }, [transactions])

  const transactionsByDay = useMemo(() => displayTransactions.reduce<Record<string, CalendarTransaction[]>>((days, tx) => {
    const key = tx.date.slice(0, 10)
    ;(days[key] ||= []).push(tx)
    return days
  }, {}), [displayTransactions])

  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const last = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    const days: Date[] = []
    for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)
    return days
  }, [currentMonth])

  const baseline = useMemo(() => {
    const currentBalance = accounts.filter(a => a.type === 'cash').reduce((sum, account) => sum + convertToMasterCurrency(account.balance, account.id), 0)
    const totalFlow = displayTransactions.reduce((sum, tx) => sum + convertToMasterCurrency(tx.amount, tx.account_id), 0)
    return currentBalance - totalFlow
  }, [accounts, convertToMasterCurrency, displayTransactions])

  const balanceByDay = useMemo(() => {
    let balance = baseline
    const values: Record<string, number> = {}
    calendarDays.forEach(day => {
      const dayTransactions = transactionsByDay[dateKey(day)] || []
      balance += dayTransactions.reduce((sum, tx) => sum + convertToMasterCurrency(tx.amount, tx.account_id), 0)
      values[dateKey(day)] = balance
    })
    return values
  }, [baseline, calendarDays, convertToMasterCurrency, transactionsByDay])

  const selectedKey = dateKey(selectedDate)
  const selectedTransactions = useMemo(() => {
    return sortCalendarTransactions(transactionsByDay[selectedKey] || [], sortOrder)
  }, [selectedKey, sortOrder, transactionsByDay])
  const selectedTotals = getDayTotals(selectedTransactions, convertToMasterCurrency)
  const chartData = useMemo<CalendarChartPoint[]>(() => calendarDays.map(day => ({
    dateKey: dateKey(day),
    label: format(day, 'd MMM'),
    balance: balanceByDay[dateKey(day)] ?? baseline,
    day,
  })), [balanceByDay, baseline, calendarDays])

  const nativeAmount = (value: number, accountId: string, compact = false) => {
    if (privacyMode === 'hidden') return '••••••'
    const options = compact && Math.abs(value) >= 1000
      ? { notation: 'compact' as const, maximumFractionDigits: 1 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    return `${Math.abs(value).toLocaleString('hu-HU', options)} ${getAccountCurrency(accountId)}`
  }
  const masterAmount = (value: number) => {
    if (privacyMode === 'hidden') return '••••••'
    return `${Math.abs(value).toLocaleString('hu-HU', { notation: 'compact', maximumFractionDigits: 1 })} ${masterCurrency}`
  }

  return (
    <section className="animate-fade-in space-y-3" aria-label="Transaction calendar">
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/30 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3">
        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
          <span className="font-semibold tracking-wide text-foreground">LEGEND</span>
          <LegendDot className="bg-success" label="Income" />
          <LegendDot className="bg-destructive" label="Expenses" />
          <LegendDot className="bg-blue-500" label="Transfer" />
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-card p-0.5" role="group" aria-label="Calendar density">
            {(['compact', 'detailed'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDensity(mode)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium capitalize transition-colors sm:text-xs ${density === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-pressed={density === mode}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/20">
          <div className="border-b border-border/60 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground"><TrendingUp className="h-3.5 w-3.5 text-success" />BALANCE TREND</div>
            <div className="h-20 cursor-pointer sm:h-24" aria-label="Animated balance trend chart. Click a day to select it.">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
                  onClick={(state) => {
                    const point = chartData[Number(state.activeTooltipIndex)]
                    if (point) setSelectedDate(point.day)
                  }}
                >
                  <defs>
                    <linearGradient id="calendarBalanceGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dateKey" hide />
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.6, strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload as CalendarChartPoint | undefined
                      if (!active || !point) return null
                      return (
                        <div className="rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
                          <p className="text-[10px] text-muted-foreground">{format(point.day, 'EEEE, MMM d')}</p>
                          <p className={`text-xs font-bold text-success ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {privacyMode === 'hidden' ? '••••••' : `${point.balance.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${masterCurrency}`}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine x={selectedKey} stroke="hsl(var(--primary))" strokeOpacity={0.55} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    fill="url(#calendarBalanceGradient)"
                    isAnimationActive
                    animationDuration={520}
                    animationEasing="ease-out"
                    activeDot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--card))', stroke: 'hsl(var(--success))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border/60 bg-secondary/30">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="py-2 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map(day => {
              const key = dateKey(day)
              const dayTransactions = transactionsByDay[key] || []
              const sortedDayTransactions = sortCalendarTransactions(dayTransactions, sortOrder)
              const dayTotals = getDayTotals(dayTransactions, convertToMasterCurrency)
              const isSelected = isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isToday = isSameDay(day, new Date())
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`flex flex-col items-stretch justify-start ${density === 'detailed' ? 'min-h-[132px] sm:min-h-[178px]' : 'min-h-[76px] sm:min-h-[92px]'} border-b border-r border-border/50 p-1.5 text-left transition-colors sm:p-2 ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/70' : 'hover:bg-secondary/40'} ${isCurrentMonth ? '' : 'bg-secondary/20 text-muted-foreground/50'}`}
                  aria-pressed={isSelected}
                  aria-label={`${format(day, 'EEEE MMMM d')}, ${dayTransactions.length} transactions`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold sm:h-6 sm:w-6 sm:text-xs ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>{format(day, 'd')}</span>
                    <DayMarkers transactions={dayTransactions} />
                  </div>
                  {density === 'detailed' && dayTransactions.length > 0 ? (
                    <div className="space-y-1">
                      {sortedDayTransactions.slice(0, 3).map(tx => <CalendarTransactionRow key={tx.id} transaction={tx} nativeAmount={nativeAmount} getCategoryIcon={getCategoryIcon} />)}
                      {sortedDayTransactions.length > 3 && <div className="pl-1 text-[9px] font-medium text-muted-foreground">+{sortedDayTransactions.length - 3} more</div>}
                    </div>
                  ) : density === 'compact' && dayTransactions.length > 0 ? (
                    <div className={`truncate text-[9px] font-semibold sm:text-[10px] ${dayTotals.net > 0 ? 'text-success' : dayTotals.net < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {dayTotals.net === 0 ? masterAmount(0) : `${dayTotals.net > 0 ? '+' : '−'}${masterAmount(dayTotals.net)}`}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-border/60 bg-background/30 xl:min-h-[28rem]" aria-live="polite">
          <div className="border-b border-border/60 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />SELECTED DAY</div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{format(selectedDate, 'EEEE, MMM d')}</h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] sm:text-[10px]">
              {selectedTotals.income > 0 && <SummaryPill label="Income" value={selectedTotals.income} tone="text-success bg-success/10" />}
              {selectedTotals.expense > 0 && <SummaryPill label="Expenses" value={selectedTotals.expense} tone="text-destructive bg-destructive/10" />}
              {selectedTotals.transfer > 0 && <SummaryPill label="Transfer" value={selectedTotals.transfer} tone="text-blue-500 bg-blue-500/10" />}
            </div>
          </div>
          <div className="max-h-[22rem] divide-y divide-border/60 overflow-y-auto">
            {selectedTransactions.length ? selectedTransactions.map(tx => {
              const transfer = !!tx.linked_transaction_id
              const label = transfer ? `Transfer to ${tx.relatedTx ? getAccountName(tx.relatedTx.account_id) : 'account'}` : (tx.description || getCategoryName(tx.category_id))
              return <div key={tx.id} className="flex items-center gap-2.5 p-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm ${transfer ? 'bg-blue-500/10 text-blue-500' : tx.amount >= 0 ? 'bg-success/10' : 'bg-secondary'}`}>{transfer ? <ArrowRightLeft className="h-4 w-4" /> : getCategoryIcon(tx.category_id)}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{label}</div><div className="truncate text-[10px] text-muted-foreground">{getAccountName(tx.account_id)} · {transfer ? 'Transfer' : getCategoryName(tx.category_id)}</div></div>
                <div className={`text-right text-xs font-bold ${transfer ? 'text-blue-500' : tx.amount >= 0 ? 'text-success' : 'text-destructive'}`}>{transfer ? '' : tx.amount >= 0 ? '+' : '−'}{nativeAmount(tx.amount, tx.account_id, true)}</div>
              </div>
            }) : <div className="px-3 py-10 text-center text-xs text-muted-foreground">No transactions on this day.</div>}
          </div>
        </aside>
      </div>
    </section>
  )
}

function getDayTotals(transactions: CalendarTransaction[], convertToMasterCurrency: (amount: number, accountId: string) => number) {
  return transactions.reduce((totals, tx) => {
    const amount = convertToMasterCurrency(tx.amount, tx.account_id)
    if (tx.linked_transaction_id) { totals.transfer += Math.abs(amount); return totals }
    if (amount >= 0) totals.income += amount
    else totals.expense += Math.abs(amount)
    totals.net += amount
    return totals
  }, { income: 0, expense: 0, transfer: 0, net: 0 })
}

function sortCalendarTransactions(
  transactions: CalendarTransaction[],
  sortOrder: 'date' | 'amount-high' | 'amount-low',
) {
  return [...transactions].sort((a, b) => {
    if (sortOrder === 'amount-high') return Math.abs(b.amount) - Math.abs(a.amount)
    if (sortOrder === 'amount-low') return Math.abs(a.amount) - Math.abs(b.amount)
    const aTimestamp = a.created_at ?? a.updated_at ?? 0
    const bTimestamp = b.created_at ?? b.updated_at ?? 0
    return bTimestamp - aTimestamp
  })
}

function DayMarkers({ transactions }: { transactions: CalendarTransaction[] }) {
  const hasIncome = transactions.some(tx => !tx.linked_transaction_id && tx.amount >= 0)
  const hasExpense = transactions.some(tx => !tx.linked_transaction_id && tx.amount < 0)
  const hasTransfer = transactions.some(tx => !!tx.linked_transaction_id)
  return <span className="flex items-center gap-0.5">{hasIncome && <i className="h-1.5 w-1.5 rounded-full bg-success" />}{hasExpense && <i className="h-1.5 w-1.5 rounded-full bg-destructive" />}{hasTransfer && <i className="h-1.5 w-1.5 rounded-full bg-blue-500" />}</span>
}

function CalendarTransactionRow({
  transaction,
  nativeAmount,
  getCategoryIcon,
}: {
  transaction: CalendarTransaction
  nativeAmount: (value: number, accountId: string, compact?: boolean) => string
  getCategoryIcon: (id?: string | null) => string
}) {
  const isTransfer = !!transaction.linked_transaction_id
  const isIncome = transaction.amount >= 0 && !isTransfer
  const tone = isTransfer ? 'text-blue-500 bg-blue-500/10' : isIncome ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'
  const sign = isTransfer ? '' : isIncome ? '+' : '−'

  return (
    <div className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold sm:text-[10px] ${tone}`}>
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm bg-background/40 text-[8px]">{isTransfer ? <ArrowRightLeft className="h-2.5 w-2.5" /> : getCategoryIcon(transaction.category_id)}</span>
      <span className="truncate">{sign}{nativeAmount(transaction.amount, transaction.account_id, true)}</span>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return <span className="flex items-center gap-1"><i className={`h-1.5 w-1.5 rounded-full ${className}`} />{label}</span>
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <span className={`rounded-full px-1.5 py-0.5 font-medium ${tone}`}>{label} {value.toLocaleString('hu-HU', { notation: 'compact', maximumFractionDigits: 1 })}</span>
}
