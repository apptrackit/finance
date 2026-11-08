import { Card, CardContent } from '../common/card'
import { usePrivacy } from '../../context/PrivacyContext'
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
  const cards = [
    { label: 'Income', value: formatSignedNumber(totalIncome, WHOLE), tone: totalIncome > 0 ? 'text-success' : 'text-foreground' },
    { label: 'Expenses', value: `${totalExpenses > 0 ? MINUS : ''}${formatNumber(totalExpenses, WHOLE)}`, tone: totalExpenses > 0 ? 'text-destructive' : 'text-foreground' },
    { label: 'Net Flow', value: formatSignedNumber(netFlow, WHOLE), tone: netFlow > 0 ? 'text-success' : netFlow < 0 ? 'text-destructive' : 'text-foreground' },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {cards.map(card => (
        <Card key={card.label}>
          <CardContent className="p-3 sm:p-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{card.label}</p>
            <p className={`mt-1 truncate text-[15px] font-semibold tracking-tight tabular-nums sm:text-2xl ${card.tone} ${hidden ? 'select-none' : ''}`}>
              {hidden ? '••••••' : card.value} <span className="text-xs font-medium text-muted-foreground sm:text-sm">{masterCurrency}</span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
