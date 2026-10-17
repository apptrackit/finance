import { Modal } from '../common/modal'
import { useHasUnsavedChanges } from '../../navigation/UnsavedChanges'
import { useAlert } from '../../context/AlertContext'
import { ManualValuations } from './ManualValuations'
import { usesMarketPricing } from '../../../../shared/holding'
import type { Account, Category, Transaction } from './types'
import { formatValue, calculatePosition } from './utils'
import { InvestmentChart } from './InvestmentChart'

type Props = {
  account: Account | null
  categories: Category[]
  allTransactions: Transaction[]
  quotes: Record<string, any>
  exchangeRates: Record<string, number>
  privacyMode: string
  onClose: () => void
  onValuationSaved?: () => void
}

export function InvestmentDetailModal({
  account,
  categories,
  allTransactions,
  quotes,
  exchangeRates,
  privacyMode,
  onClose,
  onValuationSaved = () => {}
}: Props) {
  const dirty = useHasUnsavedChanges()
  const { confirm } = useAlert()
  const close = () => {
    if (!dirty) onClose()
    else void confirm({title:'Discard unfinished appraisal?',message:'Your unsaved appraisal will be lost.',confirmText:'Discard',cancelText:'Keep editing'}).then(discard => {if(discard)onClose()})
  }
  if (!account) return null

  const transactions = allTransactions.filter(tx => tx.account_id === account.id)
  const position = calculatePosition(account, transactions, quotes, exchangeRates)

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Transfer'
    const cat = categories.find(c => c.id === categoryId)
    return cat ? `${cat.icon} ${cat.name}` : 'Unknown'
  }

  return (
    <Modal isOpen onClose={close} title={account.symbol || account.name} placement="centered"
      className="flex min-h-0 flex-col max-w-[calc(100%-2rem)] sm:max-w-6xl max-h-[90dvh] overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col p-0 sm:p-0">
      <div className="shrink-0 border-b border-border p-4 sm:px-6">
            <div className="flex flex-wrap gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Current Value</div>
                <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : formatValue(position.displayValue, account, position.quoteCurrency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Invested</div>
                <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : formatValue(position.nativeInvested, account, position.quoteCurrency)}
                </div>
              </div>
              {position.currentPrice > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Current Price</div>
                  <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : formatValue(position.currentPrice, account, position.quoteCurrency)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">Total Return</div>
                <div className={`text-lg font-bold ${position.priceFetchError ? 'text-yellow-600 dark:text-yellow-400' : position.gainLoss === null ? 'text-muted-foreground' : (position.gainLoss ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : position.priceFetchError ? '⚠️ Error fetching price' : position.gainLoss === null || position.gainLossPercent === null ? 'Return unavailable' : `${(position.gainLoss ?? 0) >= 0 ? '+' : ''}${formatValue(Math.abs(position.gainLoss), undefined, 'USD')} (${position.gainLossPercent >= 0 ? '+' : ''}${position.gainLossPercent.toFixed(2)}%)`}
                </div>
              </div>
            </div>
      </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {!usesMarketPricing(account) && <ManualValuations key={account.id} account={account} hidden={privacyMode==='hidden'} onSaved={onValuationSaved} />}
          {privacyMode !== 'hidden' && usesMarketPricing(account) && account.symbol && (
            <div className="bg-secondary/20 rounded-xl p-4">
              <InvestmentChart 
                symbol={account.symbol}
                transactions={transactions}
              />
            </div>
          )}
          
          <div>
            <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
            
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <div className="p-12 text-center bg-secondary/20 rounded-xl">
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Record a purchase or sale with a cash transfer on Dashboard.</p>
                </div>
              ) : (
                [...transactions]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(tx => (
                    <div 
                      key={tx.id} 
                      className="p-4 bg-secondary/30 rounded-xl flex justify-between items-center"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-medium ${
                          tx.amount > 0
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {tx.amount > 0 ? '↑' : '↓'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {getCategoryName(tx.category_id)}
                            </span>
                          </div>
                          <div className={`text-sm text-muted-foreground ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                            {new Date(`${tx.date}T00:00:00`).toLocaleDateString('en-US', {
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric',
                            })}
                            {privacyMode !== 'hidden' && tx.description && ` • ${tx.description}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : (
                            tx.quantity !== undefined 
                              ? `${tx.quantity > 0 ? '+' : ''}${Math.abs(tx.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 12 })} ${tx.asset_event ? 'ITEM' : account.currency}`
                              : `${tx.amount > 0 ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}`
                          )}
                        </div>
                        {tx.quantity !== undefined && (
                          <div className="text-sm text-muted-foreground">
                            {privacyMode === 'hidden' ? '••••••' : tx.execution_currency ? formatValue(Math.abs(tx.amount),undefined,tx.execution_currency) : account.holding_position ? `${Math.abs(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 12 })} · currency unverified` : formatValue(Math.abs(tx.amount), undefined, account.quote_currency || position.quoteCurrency)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
    </Modal>
  )
}
