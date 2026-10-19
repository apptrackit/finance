import { useEffect, useState } from 'react'
import { Lock, Split } from 'lucide-react'
import { Modal } from '../common/modal'
import { Button } from '../common/button'
import { Input } from '../common/input'
import { Label } from '../common/label'
import { Select } from '../common/select'
import { SplitLinesEditor } from './SplitLinesEditor'
import { usePrivacy } from '../../context/PrivacyContext'
import { useUnsavedChanges } from '../../navigation/UnsavedChanges'
import { formatCalculatedAmount } from '../../lib/amount'
import { resolveSplit, startSplit, toSplitPayloadLines, type SplitLineDraft } from '../../lib/transaction-split'

type Category = { id: string; name: string; icon?: string; type: 'income' | 'expense' }

export type AdjustmentLine = { category_id: string | null; amount: number; note: string | null }

export interface AdjustmentSave {
  date: string
  description: string | null
  excludeFromEstimate: boolean
  /** Signed lines whose sum is the balance difference. */
  lines: AdjustmentLine[]
}

interface AdjustmentComposerProps {
  isOpen: boolean
  accountName: string
  currency: string
  oldBalance: number
  newBalance: number
  categories: Category[]
  today: string
  /** Cancel returns to the account editor; nothing has been saved. */
  onClose: () => void
  onSave: (save: AdjustmentSave) => Promise<void>
}

const money = (value: number) => formatCalculatedAmount(value, { maximumFractionDigits: 2 })

/**
 * The transaction composer for a balance edit: amount and account are fixed by the
 * difference, everything else (single or split, date, note) uses the normal controls.
 */
export function AdjustmentComposer({ isOpen, accountName, currency, oldBalance, newBalance, categories, today, onClose, onSave }: AdjustmentComposerProps) {
  const { privacyMode } = usePrivacy()
  const difference = Math.round((newBalance - oldBalance) * 1e8) / 1e8
  const type = difference < 0 ? 'expense' : 'income'
  const total = Math.abs(difference)
  const typedCategories = categories.filter(category => category.type === type)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [exclude, setExclude] = useState(false)
  const [lines, setLines] = useState<SplitLineDraft[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useUnsavedChanges(isOpen || saving)

  useEffect(() => {
    if (!isOpen) return
    setCategory('')
    setDate(today)
    setDescription('')
    setExclude(false)
    setLines(null)
    setError('')
  }, [isOpen, today, oldBalance, newBalance])

  const resolution = lines ? resolveSplit(money(total), lines) : null
  const future = date > today
  const hidden = privacyMode === 'hidden'
  const mask = (value: string) => hidden ? '••••••' : value
  const sign = difference < 0 ? '−' : '+'

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (future) { setError('A balance adjustment cannot be dated in the future'); return }
    if (resolution && !resolution.valid) {
      setError(resolution.problem === 'category' ? 'Choose a category for each line' : 'Assign the full amount to the lines')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        date,
        description: description.trim() || null,
        excludeFromEstimate: type === 'expense' && exclude,
        lines: lines && resolution
          ? toSplitPayloadLines(lines, resolution, type)
          : [{ category_id: category || null, amount: difference, note: null }],
      })
    } catch (caught) {
      // Keep the draft so a failed save can be retried.
      setError(caught instanceof Error ? caught.message : 'Failed to save the adjustment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose() }} title="Record the difference" subtitle={`Balance adjustment · ${accountName}`} placement="centered">
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1 rounded-xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{lines ? 'Total' : 'Amount'}</p>
          <p className="flex items-center gap-2 text-3xl font-semibold tabular-nums">
            <span className={type === 'income' ? 'text-success' : undefined}>{mask(`${sign}${money(total)}`)}</span>
            <span className="text-sm font-semibold text-muted-foreground">{currency}</span>
            <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Fixed by the balance difference" />
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">Balance {mask(money(oldBalance))} → {mask(money(newBalance))} {currency}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="adjustment-account">Account</Label>
            <Select id="adjustment-account" value="account" disabled><option value="account">{accountName}</option></Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustment-date">Date</Label>
            <Input id="adjustment-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} required />
          </div>
          {!lines && (
            <div className="col-span-2 space-y-2">
              <Label htmlFor="adjustment-category">Category</Label>
              <Select id="adjustment-category" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="">Select Category</option>
                {typedCategories.map(item => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}
              </Select>
            </div>
          )}
          <div className="col-span-2 space-y-2">
            <Label htmlFor="adjustment-description">Description</Label>
            <Input id="adjustment-description" value={description} maxLength={500} onChange={event => setDescription(event.target.value)}
              placeholder={lines ? 'Payee or description, shared by all lines' : 'Optional'} />
          </div>
        </div>

        {lines && resolution ? (
          <SplitLinesEditor lines={lines} resolution={resolution} currency={currency} categories={typedCategories} disabled={saving}
            onChange={setLines} onUndo={() => { setCategory(lines[0]?.category_id || ''); setLines(null) }} />
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setLines(startSplit(category))}>
            <Split className="h-3.5 w-3.5" />Split into categories
          </Button>
        )}

        {type === 'expense' && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={exclude} onChange={event => setExclude(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
            <span className="text-sm text-muted-foreground">Exclude from estimate calculation (one-time expense)</span>
          </label>
        )}
        {future && <p className="text-xs text-destructive">A balance adjustment cannot be dated in the future.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || future || total === 0}>
            {saving ? 'Saving...' : lines ? `Save ${lines.length} and update balance` : 'Save and update balance'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
