import { Card, CardContent } from '../common/card'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'

type SummaryCardsProps = {
  totalIncome: number
  totalExpenses: number
  netFlow: number
  masterCurrency: string
}

export function SummaryCards({ totalIncome, totalExpenses, netFlow, masterCurrency }: SummaryCardsProps) {
  const { privacyMode } = usePrivacy()

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
      <Card className="bg-gradient-to-br from-success/10 to-transparent border-success/20">
        <CardContent className="p-4 sm:pt-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-muted-foreground">Income</p>
              <p className={`text-lg sm:text-2xl font-bold text-success truncate ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : `+${totalIncome.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
              </p>
            </div>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0 ml-2">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-destructive/10 to-transparent border-destructive/20">
        <CardContent className="p-4 sm:pt-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-muted-foreground">Expenses</p>
              <p className={`text-lg sm:text-2xl font-bold text-destructive truncate ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : `-${totalExpenses.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
              </p>
            </div>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0 ml-2">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={`bg-gradient-to-br ${netFlow >= 0 ? 'from-primary/10 border-primary/20' : 'from-destructive/10 border-destructive/20'} to-transparent`}>
        <CardContent className="p-4 sm:pt-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-muted-foreground">Net Flow</p>
              <p className={`text-lg sm:text-2xl font-bold truncate ${netFlow >= 0 ? 'text-primary' : 'text-destructive'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                {privacyMode === 'hidden' ? '••••••' : `${netFlow >= 0 ? '+' : ''}${netFlow.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} <span className="text-sm sm:text-base">{masterCurrency}</span>
              </p>
            </div>
            <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-xl ${netFlow >= 0 ? 'bg-primary/10' : 'bg-destructive/10'} flex items-center justify-center flex-shrink-0 ml-2`}>
              {netFlow >= 0 ? (
                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              ) : (
                <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
