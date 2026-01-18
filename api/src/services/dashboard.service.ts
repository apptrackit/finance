import { AccountRepository } from '../repositories/account.repository'
import { TransactionRepository } from '../repositories/transaction.repository'
import { RecurringScheduleRepository } from '../repositories/recurring-schedule.repository'
import { CategoryRepository } from '../repositories/category.repository'
import { NetWorthResponseDto, AccountNetWorth, SpendingEstimateResponseDto, CategoryEstimate } from '../dtos/dashboard.dto'
import { getExchangeRates } from '../utils/exchange-rate.util'
import { Transaction } from '../models/Transaction'
import { RecurringSchedule } from '../models/RecurringSchedule'

export class DashboardService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo?: TransactionRepository,
    private recurringScheduleRepo?: RecurringScheduleRepository,
    private categoryRepo?: CategoryRepository
  ) {}

  async getNetWorth(currency: string = 'HUF'): Promise<NetWorthResponseDto> {
    // Get all accounts - need type field too
    const accounts = await this.accountRepo.findAll()

    if (!accounts || accounts.length === 0) {
      return { net_worth: 0, currency, accounts: [], rates_fetched: false }
    }

    // Fetch exchange rates from master currency
    const rates = await getExchangeRates(currency)

    let totalNetWorth = 0
    const accountDetails: AccountNetWorth[] = []

    for (const account of accounts) {
      // Skip investment accounts - they will be calculated by frontend with market prices
      if (account.type === 'investment') {
        continue
      }

      // Skip accounts excluded from net worth
      if (account.exclude_from_net_worth) {
        continue
      }

      let balanceInMasterCurrency = account.balance

      // Convert to master currency if account is in a different currency
      if (account.currency !== currency) {
        const rate = rates[account.currency]
        if (rate) {
          // Convert: masterCurrency -> account.currency rate, so reverse to get master currency
          balanceInMasterCurrency = account.balance / rate
        } else {
          console.warn(`Exchange rate not available for ${account.currency}, using original value`)
        }
      }

      totalNetWorth += balanceInMasterCurrency

      accountDetails.push({
        id: account.id,
        balance: account.balance,
        currency: account.currency,
        balance_in_master: balanceInMasterCurrency
      })
    }

    return {
      net_worth: totalNetWorth,
      currency,
      accounts: accountDetails,
      rates_fetched: Object.keys(rates).length > 0
    }
  }

  async getSpendingEstimate(
    period: 'week' | 'month',
    currency: string = 'HUF',
    categoryId?: string
  ): Promise<SpendingEstimateResponseDto> {
    if (!this.transactionRepo || !this.recurringScheduleRepo || !this.categoryRepo) {
      throw new Error('Required repositories not initialized for spending estimates')
    }

    const today = new Date()
    
    // Calculate week of month based on how many full weeks have passed since month start
    // This ensures consistency across months that start on different days
    const startOfCurrentMonth = this.getStartOfMonth(today)
    const daysSinceMonthStart = Math.floor((today.getTime() - startOfCurrentMonth.getTime()) / (1000 * 60 * 60 * 24))
    const weekOfMonth = Math.floor(daysSinceMonthStart / 7) + 1
    
    // For recurring calculations, use start of NEXT period (since we're estimating future spending)
    const periodStartDate = period === 'week'
      ? this.getStartOfNextWeek(today)
      : this.getStartOfNextMonth(today)
    // Format date as YYYY-MM-DD in local time to avoid timezone issues
    const periodStartStr = this.formatDate(periodStartDate)

    // Fetch all historical transactions
    const allTransactions = await this.transactionRepo.findAll()
    
    // Filter expense transactions (negative amounts, excluding transfers)
    const expenseTransactions = allTransactions.filter(t => 
      t.amount < 0 && !t.linked_transaction_id
    )

    // Filter by category if specified
    const filteredTransactions = categoryId
      ? expenseTransactions.filter(t => t.category_id === categoryId)
      : expenseTransactions

    // Get exchange rates for currency conversion
    const rates = await getExchangeRates(currency)

    // Convert all transactions to target currency
    const convertedTransactions = await this.convertTransactionsToCurrency(
      filteredTransactions,
      currency,
      rates
    )

    // Calculate historical averages
    const { recentAvg, fullAvg, confidence } = this.calculateHistoricalAverages(
      convertedTransactions,
      period,
      weekOfMonth
    )

    // Combine recent and full history (70% recent, 30% baseline)
    const baseEstimate = (recentAvg * 0.7) + (fullAvg * 0.3)
    const totalEstimate = Math.abs(baseEstimate)

    // Calculate actual spending in current period (so far)
    const currentPeriodActual = await this.calculateCurrentPeriodSpending(
      convertedTransactions,
      period,
      today
    )

    // Calculate actual spending in previous period
    const previousPeriodActual = await this.calculatePreviousPeriodSpending(
      convertedTransactions,
      period,
      weekOfMonth,
      today
    )

    // Calculate category breakdown
    const categoryBreakdown = await this.calculateCategoryBreakdown(
      convertedTransactions,
      period,
      weekOfMonth,
      currency
    )

    const variancePercentage = fullAvg !== 0 
      ? ((totalEstimate - Math.abs(fullAvg)) / Math.abs(fullAvg)) * 100 
      : 0

    return {
      period,
      estimate_amount: totalEstimate,
      currency,
      confidence_level: confidence,
      historical_average_recent: Math.abs(recentAvg),
      historical_average_full: Math.abs(fullAvg),
      variance_percentage: variancePercentage,
      current_period_actual: currentPeriodActual,
      previous_period_actual: previousPeriodActual,
      week_of_month: period === 'week' ? weekOfMonth : undefined,
      breakdown: {
        recurring: 0, // Recurring is already included in historical averages
        non_recurring: totalEstimate
      },
      category_breakdown: categoryBreakdown
    }
  }

  private async convertTransactionsToCurrency(
    transactions: Transaction[],
    targetCurrency: string,
    rates: Record<string, number>
  ): Promise<Array<Transaction & { convertedAmount: number }>> {
    const accounts = await this.accountRepo.findAll()
    const accountCurrencyMap = new Map(accounts.map(a => [a.id, a.currency]))

    return transactions.map(t => {
      const accountCurrency = accountCurrencyMap.get(t.account_id) || targetCurrency
      let convertedAmount = t.amount

      if (accountCurrency !== targetCurrency) {
        const rate = rates[accountCurrency]
        if (rate) {
          convertedAmount = t.amount / rate
        }
      }

      return { ...t, convertedAmount }
    })
  }

  private calculateHistoricalAverages(
    transactions: Array<Transaction & { convertedAmount: number }>,
    period: 'week' | 'month',
    currentWeekOfMonth: number
  ): { recentAvg: number; fullAvg: number; confidence: number } {
    const now = new Date()
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(now.getMonth() - 3)
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(now.getMonth() - 6)

    // Split transactions into recent and full history
    const recentTransactions = transactions.filter(t => {
      const txDate = new Date(t.date)
      return txDate >= sixMonthsAgo
    })

    if (period === 'week') {
      // Week-aware calculation
      return this.calculateWeeklyAverage(transactions, recentTransactions, currentWeekOfMonth)
    } else {
      // Monthly calculation
      return this.calculateMonthlyAverage(transactions, recentTransactions)
    }
  }

  private calculateWeeklyAverage(
    allTransactions: Array<Transaction & { convertedAmount: number }>,
    recentTransactions: Array<Transaction & { convertedAmount: number }>,
    targetWeekOfMonth: number
  ): { recentAvg: number; fullAvg: number; confidence: number } {
    // Group by week of month
    const filterByWeek = (txs: Array<Transaction & { convertedAmount: number }>) => {
      return txs.filter(t => {
        const txDate = new Date(t.date)
        const weekOfMonth = Math.ceil(txDate.getDate() / 7)
        return weekOfMonth === targetWeekOfMonth
      })
    }

    const recentWeekTxs = filterByWeek(recentTransactions)
    const fullWeekTxs = filterByWeek(allTransactions)

    // Calculate weeks in each dataset
    const recentWeeks = this.countWeeks(recentWeekTxs, targetWeekOfMonth)
    const fullWeeks = this.countWeeks(fullWeekTxs, targetWeekOfMonth)

    const recentSum = recentWeekTxs.reduce((sum, t) => sum + t.convertedAmount, 0)
    const fullSum = fullWeekTxs.reduce((sum, t) => sum + t.convertedAmount, 0)

    const recentAvg = recentWeeks > 0 ? recentSum / recentWeeks : 0
    const fullAvg = fullWeeks > 0 ? fullSum / fullWeeks : 0

    // Confidence based on data availability
    const confidence = Math.min(100, (recentWeeks + fullWeeks) * 10)

    return { recentAvg, fullAvg, confidence }
  }

  private async calculateCurrentPeriodSpending(
    transactions: Array<Transaction & { convertedAmount: number }>,
    period: 'week' | 'month',
    today: Date
  ): Promise<number> {
    const currentPeriodStart = period === 'week'
      ? this.getStartOfWeek(today)
      : this.getStartOfMonth(today)
    const currentPeriodStartStr = this.formatDate(currentPeriodStart)
    const todayStr = this.formatDate(today)

    // Filter transactions in current period up to today
    const currentPeriodTxs = transactions.filter(t => {
      return t.date >= currentPeriodStartStr && t.date <= todayStr
    })

    // Sum the absolute value of expenses
    const total = currentPeriodTxs.reduce((sum, t) => sum + Math.abs(t.convertedAmount), 0)
    return total
  }

  private async calculatePreviousPeriodSpending(
    transactions: Array<Transaction & { convertedAmount: number }>,
    period: 'week' | 'month',
    weekOfMonth: number,
    today: Date
  ): Promise<number> {
    const previousPeriodStart = period === 'week'
      ? this.getStartOfPreviousWeek(today)
      : this.getStartOfPreviousMonth(today)
    const previousPeriodEnd = period === 'week'
      ? this.getStartOfWeek(today)
      : this.getStartOfMonth(today)

    const previousPeriodStartStr = this.formatDate(previousPeriodStart)
    const previousPeriodEndStr = this.formatDate(previousPeriodEnd)

    // Filter transactions in previous period
    const previousPeriodTxs = transactions.filter(t => {
      return t.date >= previousPeriodStartStr && t.date < previousPeriodEndStr
    })

    // Sum the absolute value of expenses
    const total = previousPeriodTxs.reduce((sum, t) => sum + Math.abs(t.convertedAmount), 0)
    return total
  }

  private calculateMonthlyAverage(
    allTransactions: Array<Transaction & { convertedAmount: number }>,
    recentTransactions: Array<Transaction & { convertedAmount: number }>
  ): { recentAvg: number; fullAvg: number; confidence: number } {
    // Count unique months
    const recentMonths = new Set(recentTransactions.map(t => t.date.substring(0, 7))).size
    const fullMonths = new Set(allTransactions.map(t => t.date.substring(0, 7))).size

    const recentSum = recentTransactions.reduce((sum, t) => sum + t.convertedAmount, 0)
    const fullSum = allTransactions.reduce((sum, t) => sum + t.convertedAmount, 0)

    const recentAvg = recentMonths > 0 ? recentSum / recentMonths : 0
    const fullAvg = fullMonths > 0 ? fullSum / fullMonths : 0

    // Confidence based on months of data
    const confidence = Math.min(100, fullMonths * 8)

    return { recentAvg, fullAvg, confidence }
  }

  private countWeeks(
    transactions: Array<Transaction & { convertedAmount: number }>,
    targetWeekOfMonth: number
  ): number {
    const weekSet = new Set<string>()
    transactions.forEach(t => {
      const date = new Date(t.date)
      const weekOfMonth = Math.ceil(date.getDate() / 7)
      if (weekOfMonth === targetWeekOfMonth) {
        // Create unique identifier: year-month-week
        const weekId = `${date.getFullYear()}-${date.getMonth()}-${weekOfMonth}`
        weekSet.add(weekId)
      }
    })
    return weekSet.size
  }

  private async calculateCategoryBreakdown(
    transactions: Array<Transaction & { convertedAmount: number }>,
    period: 'week' | 'month',
    weekOfMonth: number,
    currency: string
  ): Promise<CategoryEstimate[]> {
    if (!this.categoryRepo) return []

    const categories = await this.categoryRepo.findAll()
    const categoryMap = new Map(categories.map(c => [c.id, c]))

    // Group transactions by category
    const categoryGroups = new Map<string, Array<Transaction & { convertedAmount: number }>>()
    
    transactions.forEach(t => {
      if (!t.category_id) return
      if (!categoryGroups.has(t.category_id)) {
        categoryGroups.set(t.category_id, [])
      }
      categoryGroups.get(t.category_id)!.push(t)
    })

    const breakdown: CategoryEstimate[] = []

    for (const [categoryId, txs] of categoryGroups) {
      const category = categoryMap.get(categoryId)
      if (!category) continue

      const { recentAvg, fullAvg } = this.calculateHistoricalAverages(
        txs,
        period,
        weekOfMonth
      )

      const estimate = Math.abs((recentAvg * 0.7) + (fullAvg * 0.3))

      breakdown.push({
        category_id: categoryId,
        category_name: category.name,
        estimate_amount: estimate,
        historical_average: Math.abs(fullAvg)
      })
    }

    // Sort by estimate amount (descending)
    breakdown.sort((a, b) => b.estimate_amount - a.estimate_amount)

    return breakdown
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
    return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0)
  }

  private getStartOfPreviousWeek(date: Date): Date {
    const startOfCurrentWeek = this.getStartOfWeek(date)
    const startOfPreviousWeek = new Date(startOfCurrentWeek)
    startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7)
    return startOfPreviousWeek
  }

  private getStartOfNextWeek(date: Date): Date {
    const startOfCurrentWeek = this.getStartOfWeek(date)
    const startOfNextWeek = new Date(startOfCurrentWeek)
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7)
    return startOfNextWeek
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  }

  private getStartOfPreviousMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1, 0, 0, 0, 0)
  }

  private getStartOfNextMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0)
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
