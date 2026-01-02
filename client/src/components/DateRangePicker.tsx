import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

type DateRangePickerProps = {
  startDate: string
  endDate: string
  onApply: (range: { startDate: string; endDate: string }) => void
  onCancel: () => void
}

export function DateRangePicker({ startDate, endDate, onApply, onCancel }: DateRangePickerProps) {
  const [customRange, setCustomRange] = useState({ startDate, endDate })

  return (
    <div className="absolute top-full right-0 mt-2 p-4 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[280px]">
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={customRange.startDate}
            onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input
            type="date"
            value={customRange.endDate}
            onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(customRange)}
            className="flex-1"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}
