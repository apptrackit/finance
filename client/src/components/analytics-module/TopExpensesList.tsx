import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Transaction, Category } from './types'

type TopExpensesListProps = {
  transactions: Transaction[]
  categories: Category[]
  masterCurrency: string
  convertToMasterCurrency: (amount: number, accountId: string) => number
}

export function TopExpensesList({ transactions, categories, masterCurrency, convertToMasterCurrency }: TopExpensesListProps) {
  const { privacyMode } = usePrivacy()

  const topExpenses = transactions
    .filter(t => t.amount < 0 && !t.linked_transaction_id)
    .sort((a, b) => {
      const aConverted = Math.abs(convertToMasterCurrency(a.amount, a.account_id))
      const bConverted = Math.abs(convertToMasterCurrency(b.amount, b.account_id))
      return bConverted - aConverted
    })
    .slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm sm:text-base">Top Expenses</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {topExpenses.map((tx) => {
            const category = categories.find(c => c.id === tx.category_id)
            const convertedAmount = Math.abs(convertToMasterCurrency(tx.amount, tx.account_id))
            return (
              <div 
                key={tx.id} 
                className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-secondary flex items-center justify-center text-sm flex-shrink-0">
                  {category?.icon || '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">
                    {tx.description || category?.name || 'Expense'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {format(new Date(tx.date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className={`text-xs sm:text-sm font-bold text-destructive flex-shrink-0 ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '-••••••' : `-${convertedAmount.toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${masterCurrency}`}
                </div>
              </div>
            )
          })}
          {topExpenses.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No expenses in this period
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
