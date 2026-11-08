import { Card, CardContent } from '../common/card'
import { usePrivacy } from '../../context/PrivacyContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MINUS, formatNumber, formatSignedNumber } from '../../lib/format'

type SummaryCardsProps = {
  totalIncome: number
  totalExpenses: number
  netFlow: number
  masterCurrency: string
}

const WHOLE = { minimumFractionDigits: 0, maximumFractionDigits: 0 }

/** Neutral surfaces; color is spent only on the figure so status reads at a glance. */
export function SummaryCards({ totalIncome, totalExpenses, netFlow, masterCurrency }: SummaryCardsProps) {
  const { privacyMode } = usePrivacy()
  const hidden = privacyMode === 'hidden'
  const compact = useMediaQuery('(max-width: 639px)')
  const cards = [
    { label: 'Income', value: formatSignedNumber(totalIncome, WHOLE), tone: totalIncome > 0 ? 'text-success' : 'text-foreground' },
    { label: 'Expenses', value: `${totalExpenses > 0 ? MINUS : ''}${formatNumber(totalExpenses, WHOLE)}`, tone: totalExpenses > 0 ? 'text-destructive' : 'text-foreground' },
    { label: 'Net Flow', value: formatSignedNumber(netFlow, WHOLE), tone: netFlow > 0 ? 'text-success' : netFlow < 0 ? 'text-destructive' : 'text-foreground' },
  ]

  return (
    compact ? (
      /* Phone: one grouped card with a row per figure, so long amounts never truncate. */
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {cards.map(card => (
            <div key={card.label} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-[17px] font-semibold tracking-tight tabular-nums ${card.tone} ${hidden ? 'select-none' : ''}`}>
                {hidden ? '••••••' : card.value} <span className="text-xs font-medium text-muted-foreground">{masterCurrency}</span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    ) : (
      <div className="grid grid-cols-3 gap-4">
        {cards.map(card => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums ${card.tone} ${hidden ? 'select-none' : ''}`}>
                {hidden ? '••••••' : card.value} <span className="text-sm font-medium text-muted-foreground">{masterCurrency}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  )
}
