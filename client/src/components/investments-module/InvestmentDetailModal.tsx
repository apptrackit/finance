import type { Account, Category, Transaction } from './types'
import { formatValue, calculatePosition } from './utils'
import { InvestmentChart } from '../InvestmentChart'

type Props = {
  account: Account | null
  categories: Category[]
  allTransactions: Transaction[]
  quotes: Record<string, any>
  exchangeRates: Record<string, number>
  privacyMode: string
  onClose: () => void
}

export function InvestmentDetailModal({
  account,
  categories,
  allTransactions,
  quotes,
  exchangeRates,
  privacyMode,
  onClose
}: Props) {
  if (!account) return null

  const transactions = allTransactions.filter(tx => tx.account_id === account.id)
  const position = calculatePosition(account, transactions, quotes, exchangeRates)

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Transfer'
    const cat = categories.find(c => c.id === categoryId)
    return cat ? `${cat.icon} ${cat.name}` : 'Unknown'
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-border flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-2xl">{account.symbol || account.name}</h2>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                account.asset_type === 'crypto' 
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                  : account.asset_type === 'manual' 
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' 
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {account.asset_type?.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{account.name}</p>
            
            <div className="flex gap-6 mt-4">
              <div>
                <div className="text-xs text-muted-foreground">Current Value</div>
                <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : formatValue(position.displayValue, account)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Invested</div>
                <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : formatValue(position.netInvested, account)}
                </div>
              </div>
              {position.currentPrice > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Current Price</div>
                  <div className={`text-lg font-bold ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                    {privacyMode === 'hidden' ? '••••••' : formatValue(position.currentPrice, account)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">Total Return</div>
                <div className={`text-lg font-bold ${position.priceFetchError ? 'text-yellow-600 dark:text-yellow-400' : position.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                  {privacyMode === 'hidden' ? '••••••' : position.priceFetchError ? '⚠️ Error fetching price' : `${position.gainLoss >= 0 ? '+' : ''}${formatValue(Math.abs(position.gainLoss), account)} (${position.gainLossPercent >= 0 ? '+' : ''}${position.gainLossPercent.toFixed(2)}%)`}
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-secondary rounded-lg transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {account.asset_type !== 'manual' && account.symbol && (
            <div className="bg-secondary/20 rounded-xl p-4">
              <InvestmentChart 
                symbol={account.symbol}
                transactions={transactions}
              />
            </div>
          )}
          
          <div>
            <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <strong>💡 How to log investment transactions:</strong><br/>
                For stock/crypto investments, log the <strong>dollar amount</strong> you invested, not the number of shares.<br/>
                Example: If you bought 5 shares of AAPL for $1,400, log an income transaction of <strong>$1,400</strong> with description "Bought 5 AAPL shares"
              </p>
            </div>
            
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <div className="p-12 text-center bg-secondary/20 rounded-xl">
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Go to Dashboard to add income, expense, or swap transactions</p>
                </div>
              ) : (
                [...transactions]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(tx => (
                    <div 
                      key={tx.id} 
                      className="p-4 bg-secondary/30 hover:bg-secondary/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer"
                      onClick={() => {
                        console.log('=== TRANSACTION DEBUG ===')
                        console.log('Transaction:', tx)
                        console.log('ID:', tx.id)
                        console.log('Amount (USD):', tx.amount)
                        console.log('Quantity (shares):', tx.quantity)
                        console.log('Description:', tx.description)
                        console.log('Date:', tx.date)
                        console.log('Account:', account)
                        console.log('Account Balance:', account.balance)
                        console.log('Account Currency:', account.currency)
                        console.log('========================')
                      }}
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
                            {new Date(tx.date).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                            {tx.description && ` • ${tx.description}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'} ${privacyMode === 'hidden' ? 'select-none' : ''}`}>
                          {privacyMode === 'hidden' ? '••••••' : (
                            tx.quantity !== undefined 
                              ? `${tx.quantity > 0 ? '+' : ''}${Math.abs(tx.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${account.currency}`
                              : `${tx.amount > 0 ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}`
                          )}
                        </div>
                        {tx.quantity !== undefined && (
                          <div className="text-sm text-muted-foreground">
                            ${Math.abs(tx.amount).toFixed(2)} USD
                          </div>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
