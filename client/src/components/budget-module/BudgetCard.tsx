import { Pencil, Trash2 } from 'lucide-react'
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
}

export function BudgetCard({ budget, spent, progress, currency, onEdit, onDelete }: BudgetCardProps) {
  const remaining = Math.max(budget.amount - spent, 0)
  const over = spent > budget.amount
  const displayProgress = Math.min(progress, 1)

  const progressColor = over
    ? 'bg-destructive'
    : progress >= 0.8
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">{getBudgetLabel(budget)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {formatBudgetPeriod(budget)} • {formatScopeLabel(budget)} • {formatCategoryScopeLabel(budget)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => onEdit(budget)} aria-label="Edit budget">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(budget)} aria-label="Delete budget">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {budget.amount.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {currency}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Budgeted amount
            </p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-medium ${over ? 'text-destructive' : 'text-foreground'}`}>
              {spent.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {currency}
            </p>
            <p className="text-xs text-muted-foreground">
              {over ? 'Over budget' : `${remaining.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} ${currency} left`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${displayProgress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress * 100)}% used</span>
            <span>{formatBudgetPeriod(budget)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
