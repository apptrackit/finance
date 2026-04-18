import { useState, useRef, useEffect } from 'react'
import { format, subDays, startOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

const ALL_TIME = { startDate: '1900-01-01', endDate: '2100-12-31' }

type Preset = {
  label: string
  range: () => { startDate: string; endDate: string }
}

const PRESETS: Preset[] = [
  {
    label: 'Last 30d',
    range: () => ({
      startDate: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 3m',
    range: () => ({
      startDate: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This year',
    range: () => ({
      startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
      endDate: format(endOfYear(new Date()), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'All time',
    range: () => ALL_TIME,
  },
]

type DateRangePickerProps = {
  startDate: string
  endDate: string
  onApply: (range: { startDate: string; endDate: string }) => void
  onCancel: () => void
}

export function DateRangePicker({ startDate, endDate, onApply, onCancel }: DateRangePickerProps) {
  const [customRange, setCustomRange] = useState({ startDate, endDate })
  const pickerRef = useRef<HTMLDivElement>(null)
  const [positioning, setPositioning] = useState<'right' | 'left'>('right')

  const isAllTime = startDate === ALL_TIME.startDate && endDate === ALL_TIME.endDate

  const activePreset = PRESETS.find(p => {
    const r = p.range()
    return r.startDate === startDate && r.endDate === endDate
  })

  useEffect(() => {
    if (pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect()
      if (rect.left < 8) setPositioning('left')
      else setPositioning('right')
    }
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={onCancel} />

      <div
        ref={pickerRef}
        className={`fixed md:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-full md:translate-x-0 md:translate-y-0 mt-0 md:mt-2 p-4 bg-background border border-border rounded-lg shadow-lg z-50 w-[min(320px,calc(100vw-2rem))] md:w-auto md:min-w-[280px] ${
          positioning === 'right' ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'
        }`}
      >
        <div className="space-y-3">
          {/* Quick presets */}
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map(preset => {
              const isActive = activePreset?.label === preset.label
              return (
                <button
                  key={preset.label}
                  onClick={() => onApply(preset.range())}
                  className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          {!isAllTime && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground">custom</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={customRange.startDate}
                  onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
                  className="mt-1 w-full max-w-full [-webkit-appearance:none]"
                />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={customRange.endDate}
                  onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
                  className="mt-1 w-full max-w-full [-webkit-appearance:none]"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
                  Cancel
                </Button>
                <Button size="sm" onClick={() => onApply(customRange)} className="flex-1">
                  Apply
                </Button>
              </div>
            </>
          )}

          {isAllTime && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCancel} className="w-full">
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
