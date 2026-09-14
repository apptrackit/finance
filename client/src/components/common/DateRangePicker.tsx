import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'
import { format, endOfMonth, startOfMonth } from 'date-fns'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

const ALL_TIME = { startDate: '1900-01-01', endDate: '2100-12-31' }
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type PickerMode = 'month' | 'custom' | 'all'

type DateRangePickerProps = {
  startDate: string
  endDate: string
  onApply: (range: { startDate: string; endDate: string }) => void
  onCancel: () => void
  monthOnly?: boolean
}

const toLocalDate = (date: string) => new Date(`${date}T12:00:00`)

const monthRange = (date: Date) => ({
  startDate: format(startOfMonth(date), 'yyyy-MM-dd'),
  endDate: format(endOfMonth(date), 'yyyy-MM-dd'),
})

const isWholeMonth = (startDate: string, endDate: string) => {
  const range = monthRange(toLocalDate(startDate))
  return range.startDate === startDate && range.endDate === endDate
}

export function DateRangePicker({ startDate, endDate, onApply, onCancel, monthOnly = false }: DateRangePickerProps) {
  const currentDate = new Date()
  const isAllTime = startDate === ALL_TIME.startDate && endDate === ALL_TIME.endDate
  const initialMonth = isAllTime ? new Date() : toLocalDate(startDate)
  const initialMode: PickerMode = monthOnly ? 'month' : isAllTime ? 'all' : isWholeMonth(startDate, endDate) ? 'month' : 'custom'

  const [mode, setMode] = useState<PickerMode>(initialMode)
  const [customRange, setCustomRange] = useState({ startDate, endDate })
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [displayYear, setDisplayYear] = useState(initialMonth.getFullYear())
  const [positioning, setPositioning] = useState<'right' | 'left'>('right')
  const pickerRef = useRef<HTMLDivElement>(null)

  const selectedRange = monthOnly || mode === 'month' ? monthRange(selectedMonth) : mode === 'all' ? ALL_TIME : customRange
  const invalidCustomRange = mode === 'custom' && (!customRange.startDate || !customRange.endDate || customRange.startDate > customRange.endDate)

  useEffect(() => {
    if (!pickerRef.current) return
    const rect = pickerRef.current.getBoundingClientRect()
    setPositioning(rect.left < 8 ? 'left' : 'right')
  }, [])

  const selectMonth = (month: number) => {
    const next = new Date(displayYear, month, 1)
    setSelectedMonth(next)
    onApply(monthRange(next))
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden" onClick={onCancel} />

      <div
        ref={pickerRef}
        className={`fixed md:absolute top-1/2 left-1/2 z-50 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:top-full md:mt-2 md:w-[360px] md:translate-x-0 md:translate-y-0 ${
          positioning === 'right' ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Choose timeframe</p>
              <p className="text-[11px] text-muted-foreground">{mode === 'all' ? 'Every transaction' : mode === 'custom' ? 'A custom date range' : format(selectedMonth, 'MMMM yyyy')}</p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Close timeframe picker">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          <div className="grid gap-1 rounded-xl bg-background/70 p-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="tablist" aria-label="Timeframe type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'month'}
              onClick={() => setMode('month')}
              className={`flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg px-1 py-2 text-xs font-medium transition-colors ${mode === 'month' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Month
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'custom'}
              disabled={monthOnly}
              onClick={() => setMode('custom')}
              className={`flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg px-1 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'custom' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Custom
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'all'}
              disabled={monthOnly}
              onClick={() => onApply(ALL_TIME)}
              className={`flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg px-1 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All time
            </button>
          </div>

          {mode === 'month' && (
            <div className="mt-3">
              <div className="mb-4 flex items-center justify-between px-1">
                <button onClick={() => setDisplayYear(year => year - 1)} className="flex h-7 w-7 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Previous year">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium tabular-nums">{displayYear}</span>
                <button onClick={() => setDisplayYear(year => year + 1)} className="flex h-7 w-7 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Next year">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div
                className="grid px-1"
                style={{
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(3, 2.5rem)',
                  columnGap: '0.5rem',
                  rowGap: '0.5rem',
                }}
              >
                {MONTH_NAMES.map((month, index) => {
                  const selected = selectedMonth.getFullYear() === displayYear && selectedMonth.getMonth() === index
                  const isCurrentMonth = currentDate.getFullYear() === displayYear && currentDate.getMonth() === index
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => selectMonth(index)}
                      aria-current={isCurrentMonth ? 'date' : undefined}
                      style={!selected && isCurrentMonth ? {
                        borderColor: 'hsl(var(--primary) / 0.72)',
                        backgroundColor: 'hsl(var(--primary) / 0.08)',
                        boxShadow: 'inset 0 0 0 1px hsl(var(--primary) / 0.72)',
                      } : undefined}
                      className={`h-full w-full min-w-0 rounded-xl border px-1 text-sm font-normal leading-none transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : isCurrentMonth ? 'text-foreground hover:bg-secondary' : 'border-transparent text-foreground hover:bg-secondary'}`}
                    >
                      {month}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" value={customRange.startDate} onChange={event => setCustomRange(range => ({ ...range, startDate: event.target.value }))} className="mt-1 w-full [-webkit-appearance:none]" />
                </div>
                <div>
                  <Label className="text-xs">End date</Label>
                  <Input type="date" value={customRange.endDate} onChange={event => setCustomRange(range => ({ ...range, endDate: event.target.value }))} className="mt-1 w-full [-webkit-appearance:none]" />
                </div>
              </div>
              {invalidCustomRange && <p className="text-xs text-destructive">Choose an end date that is on or after the start date.</p>}
            </div>
          )}

          {mode === 'all' && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-4 text-center">
              <Clock3 className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-medium">Every transaction</p>
              <p className="mt-1 text-xs text-muted-foreground">Your filters will include the complete history.</p>
            </div>
          )}
        </div>

        {mode === 'custom' && (
          <div className="flex gap-2 border-t border-border/70 p-3 sm:p-4">
            <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={() => onApply(selectedRange)} disabled={invalidCustomRange} className="flex-1">
              Apply timeframe
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
