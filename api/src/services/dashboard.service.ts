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
    categoryId?: string,
    includeRecurring: boolean = true
  ): Promise<SpendingEstimateResponseDto> {
    if (!this.transactionRepo || !this.recurringScheduleRepo || !this.categoryRepo) {
      throw new Error('Required repositories not initialized for spending estimates')
    }

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    
    // Calculate week of month (1-4+)
    const weekOfMonth = Math.ceil(today.getDate() / 7)

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

    // Get recurring transactions for the period
    let recurringAmount = 0
    if (includeRecurring && this.recurringScheduleRepo) {
      recurringAmount = await this.calculateRecurringForPeriod(
        period,
        currency,
        rates,
        categoryId,
        todayStr,
        weekOfMonth
      )
    }

    // Calculate category breakdown
    const categoryBreakdown = await this.calculateCategoryBreakdown(
      convertedTransactions,
      period,
      weekOfMonth,
      currency
    )

    const totalEstimate = Math.abs(baseEstimate) + recurringAmount
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
      week_of_month: period === 'week' ? weekOfMonth : undefined,
      breakdown: {
        recurring: recurringAmount,
        non_recurring: Math.abs(baseEstimate)
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

  private async calculateRecurringForPeriod(
    period: 'week' | 'month',
    currency: string,
    rates: Record<string, number>,
    categoryId: string | undefined,
    startDate: string,
    weekOfMonth: number
  ): Promise<number> {
    if (!this.recurringScheduleRepo) return 0

    const activeSchedules = await this.recurringScheduleRepo.findActive()
    
    // Filter expense schedules (negative amounts)
    let expenseSchedules = activeSchedules.filter(s => 
      s.type === 'transaction' && s.amount < 0
    )

    // Filter by category if specified
    if (categoryId) {
      expenseSchedules = expenseSchedules.filter(s => s.category_id === categoryId)
    }

    const accounts = await this.accountRepo.findAll()
    const accountCurrencyMap = new Map(accounts.map(a => [a.id, a.currency]))

    let totalRecurring = 0

    for (const schedule of expenseSchedules) {
      // Check if schedule will trigger in the target period
      const willTrigger = this.scheduleTriggersInPeriod(schedule, period, weekOfMonth, startDate)
      
      if (willTrigger) {
        const accountCurrency = accountCurrencyMap.get(schedule.account_id) || currency
        let amount = Math.abs(schedule.amount)

        // Convert to target currency
        if (accountCurrency !== currency) {
          const rate = rates[accountCurrency]
          if (rate) {
            amount = amount / rate
          }
        }

        totalRecurring += amount
      }
    }

    return totalRecurring
  }

  private scheduleTriggersInPeriod(
    schedule: RecurringSchedule,
    period: 'week' | 'month',
    weekOfMonth: number,
    startDate: string
  ): boolean {
    const now = new Date(startDate)

    // Check end date
    if (schedule.end_date && schedule.end_date < startDate) {
      return false
    }

    // Check remaining occurrences
    if (schedule.remaining_occurrences !== undefined && schedule.remaining_occurrences <= 0) {
      return false
    }

    if (period === 'week') {
      // For weekly estimates, check if schedule triggers in this week type
      if (schedule.frequency === 'daily') {
        return true // Daily schedules always trigger
      } else if (schedule.frequency === 'weekly') {
        // Weekly schedules trigger once per week
        return true
      } else if (schedule.frequency === 'monthly') {
        // Monthly schedules only trigger if day_of_month falls in this week
        if (schedule.day_of_month) {
          const scheduleWeekOfMonth = Math.ceil(schedule.day_of_month / 7)
          return scheduleWeekOfMonth === weekOfMonth
        }
      }
    } else {
      // For monthly estimates, all active schedules contribute
      if (schedule.frequency === 'daily') {
        return true // Will trigger ~30 times
      } else if (schedule.frequency === 'weekly') {
        return true // Will trigger ~4 times
      } else if (schedule.frequency === 'monthly') {
        return true // Will trigger once
      }
    }

    return false
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
}
