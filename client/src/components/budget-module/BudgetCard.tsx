import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { Button } from '../common/button'
import type { Budget } from './types'
import { formatBudgetPeriod, formatCategoryScopeLabel, formatScopeLabel, getBudgetLabel } from './utils'

type BudgetCardProps = {
  budget: Budget
  spent: number
  progress: number
  currency: string
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
  deletingId?: string | null
}

export function BudgetCard({ budget, spent, progress, currency, onEdit, onDelete, deletingId }: BudgetCardProps) {
  const remaining = budget.amount - spent
  const over = spent > budget.amount
  const overspent = Math.max(spent - budget.amount, 0)
  const displayProgress = Math.min(progress, 1)

  const progressColor = over
    ? 'bg-destructive'
    : progress >= 0.8
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <Card className="group relative overflow-hidden hover:shadow-md transition-all duration-300 border-muted/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold mb-1 tracking-tight">{getBudgetLabel(budget)}</CardTitle>
            <p className="text-[11px] text-muted-foreground/60 font-medium">
              {formatBudgetPeriod(budget)} • {formatScopeLabel(budget)} • {formatCategoryScopeLabel(budget)}
            </p>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted/50" onClick={() => onEdit(budget)} aria-label="Edit budget">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" disabled={deletingId === budget.id} className="h-7 w-7 hover:bg-destructive/10" onClick={() => onDelete(budget)} aria-label="Delete budget">
              {deletingId === budget.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive/70" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-5">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-xl sm:text-2xl text-muted-foreground/50 font-semibold tabular-nums pb-0.5">
              {spent.toLocaleString('hu-HU', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xl sm:text-2xl text-muted-foreground/30 font-extralight pb-0.5">/</span>
            <span className="text-[32px] sm:text-[40px] font-bold tracking-tight tabular-nums leading-none text-foreground">
              {budget.amount.toLocaleString('hu-HU', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-muted-foreground/40 font-medium uppercase tracking-wider pb-0.5">{currency}</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="relative h-1 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${progressColor} shadow-sm`}
              style={{ width: `${displayProgress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wide">{Math.round(progress * 100)}% used</span>
            {over ? (
              <div className="flex flex-col items-end">
                <span className="text-sm font-extrabold tabular-nums text-destructive">
                  {overspent.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {currency}
                </span>
                <span className="text-[10px] font-semibold text-destructive/70 uppercase tracking-wide">overspent</span>
              </div>
            ) : (
              <span className="text-xs font-bold tabular-nums tracking-tight text-muted-foreground/50">
                {remaining.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {currency}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
