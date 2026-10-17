import { Plus, Undo2, X } from 'lucide-react'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Select } from '../common/select'
import { AmountInput } from '../common/amount-input'
import { formatCalculatedAmount } from '../../lib/amount'
import { cn } from '../../lib/utils'
import {
  MAX_SPLIT_LINES,
  newSplitLine,
  removeLine,
  setLineAmount,
  splitEqually,
  type SplitLineDraft,
  type SplitResolution,
} from '../../lib/transaction-split'

type Category = { id: string; name: string; icon?: string; type: 'income' | 'expense' }

// Data colours for the allocation bar and line markers; they identify lines, not meaning.
const LINE_COLORS = ['#5189D8', '#9B8AF0', '#5CC7C0', '#F0A35C', '#E58AB0', '#8A9BB4']

interface SplitLinesEditorProps {
  lines: SplitLineDraft[]
  resolution: SplitResolution
  currency: string
  categories: Category[]
  disabled?: boolean
  onChange: (lines: SplitLineDraft[]) => void
  /** Leave split mode. Omitted when the composer cannot return to a single entry. */
  onUndo?: () => void
}

const money = (value: number) => formatCalculatedAmount(value, { maximumFractionDigits: 2 })

export function SplitLinesEditor({ lines, resolution, currency, categories, disabled, onChange, onUndo }: SplitLinesEditorProps) {
  const { amounts, total, fixed, remainder, valid } = resolution
  const assigned = amounts.reduce((sum, value) => sum + value, 0)
  const scale = Math.max(fixed ? total : assigned, assigned) || 1
  const status = valid ? 'Fully assigned'
    : fixed && remainder > 0 ? `${money(remainder)} ${currency} left`
    : fixed && remainder < 0 ? `${money(-remainder)} ${currency} over`
    : assigned > 0 ? `Total ${money(assigned)} ${currency}`
    : 'Nothing assigned'
  const tone = valid ? 'text-success' : fixed && remainder < 0 ? 'text-destructive' : 'text-muted-foreground'

  const update = (id: string, patch: Partial<SplitLineDraft>) => onChange(lines.map(line => line.id === id ? { ...line, ...patch } : line))

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">{lines.length} lines</span>
          <span role="status" className={cn('font-semibold tabular-nums', tone)}>{status}</span>
        </div>
        <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary">
          {amounts.map((value, index) => value > 0 && (
            <div key={lines[index].id} className="h-full" style={{ width: `${Math.min(100, (value / scale) * 100)}%`, background: LINE_COLORS[index % LINE_COLORS.length] }} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const label = `line ${index + 1}`
          const isRest = fixed && index === 0 && line.auto
          return (
            <div key={line.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[auto_minmax(0,9.5rem)_minmax(0,1fr)_8.5rem_auto] sm:border-0 sm:p-0">
              <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />
              <Select
                aria-label={`Category for ${label}`}
                value={line.category_id}
                disabled={disabled}
                onChange={event => update(line.id, { category_id: event.target.value })}
                className={cn('h-9 text-[13px]', !line.category_id && 'text-muted-foreground')}
              >
                <option value="">Category</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
              </Select>
              <Button
                type="button" variant="ghost" size="icon" className="h-9 w-9 sm:order-last text-muted-foreground"
                aria-label={`Remove ${label}`} disabled={disabled || lines.length <= 1}
                onClick={() => onChange(removeLine(lines, line.id))}
              ><X className="h-4 w-4" /></Button>
              <Input
                aria-label={`Note for ${label}`}
                value={line.note}
                disabled={disabled}
                maxLength={500}
                onChange={event => update(line.id, { note: event.target.value })}
                placeholder="Note (optional)"
                className="col-span-2 h-9 text-[13px] sm:col-span-1"
              />
              <div className="relative col-span-3 sm:col-span-1">
                <AmountInput
                  aria-label={`Amount for ${label}`}
                  value={isRest ? money(amounts[0]) : line.amount}
                  disabled={disabled}
                  onValueChange={value => onChange(setLineAmount(lines, line.id, value))}
                  allowNegative={false}
                  placeholder="0"
                  className={cn('h-9 pr-11 text-right text-sm font-semibold tabular-nums', isRest && 'pl-12')}
                />
                {isRest && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Rest</span>}
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currency}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || lines.length >= MAX_SPLIT_LINES}
          onClick={() => onChange([...lines, newSplitLine()])}><Plus className="h-3.5 w-3.5" />Add line</Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !fixed}
          title={fixed ? undefined : 'Enter a total first'}
          onClick={() => onChange(splitEqually(total, lines))}>Split equally</Button>
        {onUndo && <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground" disabled={disabled} onClick={onUndo}><Undo2 className="h-3.5 w-3.5" />Undo split</Button>}
      </div>
    </div>
  )
}
