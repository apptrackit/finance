import { useState } from 'react'
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { DateRangePicker } from '../common/DateRangePicker'
import type { DashboardFilters, FilterChange } from '../../navigation/filters'

export function DashboardPeriodPicker({ filters, onChange }: { filters: DashboardFilters; onChange: FilterChange<DashboardFilters> }) {
  const [open, setOpen] = useState(false)
  const start = parseISO(filters.startDate)
  const end = parseISO(filters.endDate)
  const wholeMonth = filters.startDate === format(startOfMonth(start), 'yyyy-MM-dd') && filters.endDate === format(endOfMonth(start), 'yyyy-MM-dd')
  const label = filters.range === 'allTime' ? 'All Time' : wholeMonth ? format(start, 'MMMM yyyy') : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
  const apply = (range: { startDate: string; endDate: string }) => {
    onChange({ ...range, range: range.startDate === '1900-01-01' && range.endDate === '2100-12-31' ? 'allTime' : 'custom' })
    setOpen(false)
  }
  const step = (direction: number) => {
    const month = addMonths(start, direction)
    const days = (differenceInCalendarDays(end, start) + 1) * direction
    apply(wholeMonth ? { startDate: format(startOfMonth(month), 'yyyy-MM-dd'), endDate: format(endOfMonth(month), 'yyyy-MM-dd') }
      : { startDate: format(addDays(start, days), 'yyyy-MM-dd'), endDate: format(addDays(end, days), 'yyyy-MM-dd') })
  }
  return <div className="relative w-fit max-w-full">
    <div className="flex min-h-10 items-center overflow-hidden rounded-[10px] border border-border bg-card text-sm">
      {filters.range !== 'allTime' && <button type="button" aria-label="Previous period" onClick={() => step(-1)} className="finance-icon-button h-10 w-10 rounded-none"><ChevronLeft className="h-4 w-4" /></button>}
      <button type="button" aria-label={`Choose period: ${label}`} aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-10 min-w-0 items-center gap-2 border-x border-border px-3 font-medium hover:bg-secondary">
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" /><span>{label}</span>
      </button>
      {filters.range !== 'allTime' && <button type="button" aria-label="Next period" onClick={() => step(1)} className="finance-icon-button h-10 w-10 rounded-none"><ChevronRight className="h-4 w-4" /></button>}
    </div>
    {open && <DateRangePicker startDate={filters.startDate} endDate={filters.endDate} monthOnly={filters.view === 'calendar'} onApply={apply} onCancel={() => setOpen(false)} />}
  </div>
}
