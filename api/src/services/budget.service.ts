import { BudgetRepository } from '../repositories/budget.repository'
import { AccountRepository } from '../repositories/account.repository'
import { CategoryRepository } from '../repositories/category.repository'
import { Budget, BudgetAccountScope, BudgetCategoryScope, BudgetPeriod } from '../models/Budget'
import { BudgetResponseDto, CreateBudgetDto, UpdateBudgetDto } from '../dtos/budget.dto'

const PERIODS: BudgetPeriod[] = ['monthly', 'yearly']
const ACCOUNT_SCOPES: BudgetAccountScope[] = ['all', 'cash', 'selected']
const CATEGORY_SCOPES: BudgetCategoryScope[] = ['all', 'selected']

export class BudgetService {
  constructor(
    private budgetRepo: BudgetRepository,
    private accountRepo: AccountRepository,
    private categoryRepo: CategoryRepository
  ) {}

  async getAllBudgets(): Promise<BudgetResponseDto[]> {
    const budgets = await this.budgetRepo.findAll()
    return budgets.map(b => this.toDto(b))
  }

  async getBudgetById(id: string): Promise<BudgetResponseDto> {
    const budget = await this.budgetRepo.findById(id)
    if (!budget) {
      throw new Error('Budget not found')
    }
    return this.toDto(budget)
  }

  async createBudget(dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    this.validateCommonFields(dto)

    const { startDate, endDate } = this.buildDateRange(dto.period, dto.year, dto.month)
    const now = Date.now()

    const budget: Budget = {
      id: crypto.randomUUID(),
      name: dto.name?.trim() || undefined,
      amount: dto.amount,
      period: dto.period,
      start_date: startDate,
      end_date: endDate,
      account_scope: dto.account_scope,
      category_scope: dto.category_scope,
      currency: dto.currency?.trim() || undefined,
      created_at: now,
      updated_at: now,
      account_ids: dto.account_scope === 'selected' ? (dto.account_ids || []) : [],
      category_ids: dto.category_scope === 'selected' ? (dto.category_ids || []) : []
    }

    await this.validateScopes(budget)
    await this.budgetRepo.create(budget)

    return this.toDto(budget)
  }

  async updateBudget(id: string, dto: UpdateBudgetDto): Promise<BudgetResponseDto> {
    const existing = await this.budgetRepo.findById(id)
    if (!existing) {
      throw new Error('Budget not found')
    }

    const nextPeriod = dto.period ?? existing.period
    const nextYear = dto.year ?? this.getYearFromDate(existing.start_date)
    const nextMonth = dto.month ?? this.getMonthFromDate(existing.start_date)

    const merged: Budget = {
      ...existing,
      ...dto,
      name: dto.name !== undefined ? (dto.name?.trim() || undefined) : existing.name,
      currency: dto.currency !== undefined ? (dto.currency?.trim() || undefined) : existing.currency,
      account_ids: dto.account_ids ?? existing.account_ids ?? [],
      category_ids: dto.category_ids ?? existing.category_ids ?? []
    }

    this.validateCommonFields({
      amount: merged.amount,
      period: nextPeriod,
      year: nextYear,
      month: nextMonth,
      account_scope: merged.account_scope,
      category_scope: merged.category_scope,
      account_ids: merged.account_ids,
      category_ids: merged.category_ids
    })

    const { startDate, endDate } = this.buildDateRange(nextPeriod, nextYear, nextMonth)
    merged.start_date = startDate
    merged.end_date = endDate

    merged.updated_at = Date.now()

    await this.validateScopes(merged)
    await this.budgetRepo.update(id, {
      name: merged.name,
      amount: merged.amount,
      period: merged.period,
      start_date: merged.start_date,
      end_date: merged.end_date,
      account_scope: merged.account_scope,
      category_scope: merged.category_scope,
      currency: merged.currency,
      updated_at: merged.updated_at,
      account_ids: merged.account_scope === 'selected' ? merged.account_ids : [],
      category_ids: merged.category_scope === 'selected' ? merged.category_ids : []
    })

    const updated = await this.budgetRepo.findById(id)
    return this.toDto(updated!)
  }

  async deleteBudget(id: string): Promise<void> {
    const existing = await this.budgetRepo.findById(id)
    if (!existing) {
      throw new Error('Budget not found')
    }
    await this.budgetRepo.delete(id)
  }

  private validateCommonFields(dto: {
    amount: number
    period: BudgetPeriod
    year: number
    month?: number
    account_scope: BudgetAccountScope
    category_scope: BudgetCategoryScope
    account_ids?: string[]
    category_ids?: string[]
  }) {
    if (!PERIODS.includes(dto.period)) {
      throw new Error('Invalid period')
    }
    if (!ACCOUNT_SCOPES.includes(dto.account_scope)) {
      throw new Error('Invalid account scope')
    }
    if (!CATEGORY_SCOPES.includes(dto.category_scope)) {
      throw new Error('Invalid category scope')
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }

    if (!Number.isInteger(dto.year) || dto.year < 2000 || dto.year > 2100) {
      throw new Error('Invalid year')
    }

    if (dto.period === 'monthly') {
      if (dto.month === undefined || dto.month < 1 || dto.month > 12) {
        throw new Error('Month must be between 1-12 for monthly budgets')
      }
    }

    if (dto.account_scope === 'selected' && (!dto.account_ids || dto.account_ids.length === 0)) {
      throw new Error('Select at least one account')
    }

    if (dto.category_scope === 'selected' && (!dto.category_ids || dto.category_ids.length === 0)) {
      throw new Error('Select at least one category')
    }
  }

  private async validateScopes(budget: Budget) {
    if (budget.account_scope === 'selected') {
      const invalidAccounts = await this.findMissingAccounts(budget.account_ids || [])
      if (invalidAccounts.length > 0) {
        throw new Error('One or more accounts do not exist')
      }
    }

    if (budget.category_scope === 'selected') {
      const invalidCategories = await this.findMissingCategories(budget.category_ids || [])
      if (invalidCategories.length > 0) {
        throw new Error('One or more categories do not exist')
      }
    }
  }

  private async findMissingAccounts(accountIds: string[]): Promise<string[]> {
    const checks = await Promise.all(accountIds.map(id => this.accountRepo.findById(id)))
    return accountIds.filter((_, idx) => !checks[idx])
  }

  private async findMissingCategories(categoryIds: string[]): Promise<string[]> {
    const checks = await Promise.all(categoryIds.map(id => this.categoryRepo.findById(id)))
    return categoryIds.filter((_, idx) => !checks[idx])
  }

  private buildDateRange(period: BudgetPeriod, year: number, month?: number) {
    if (period === 'monthly') {
      const monthIndex = (month ?? 1) - 1
      const startDateObj = new Date(Date.UTC(year, monthIndex, 1))
      const endDateObj = new Date(Date.UTC(year, monthIndex + 1, 0))
      return {
        startDate: this.formatDate(startDateObj),
        endDate: this.formatDate(endDateObj)
      }
    }

    const startDateObj = new Date(Date.UTC(year, 0, 1))
    const endDateObj = new Date(Date.UTC(year, 11, 31))
    return {
      startDate: this.formatDate(startDateObj),
      endDate: this.formatDate(endDateObj)
    }
  }

  private formatDate(date: Date) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private getYearFromDate(dateStr: string): number {
    return Number(dateStr.split('-')[0])
  }

  private getMonthFromDate(dateStr: string): number | undefined {
    const parts = dateStr.split('-')
    if (parts.length < 2) return undefined
    return Number(parts[1])
  }

  private toDto(budget: Budget): BudgetResponseDto {
    return {
      id: budget.id,
      name: budget.name,
      amount: budget.amount,
      period: budget.period,
      start_date: budget.start_date,
      end_date: budget.end_date,
      account_scope: budget.account_scope,
      category_scope: budget.category_scope,
      account_ids: budget.account_ids || [],
      category_ids: budget.category_ids || [],
      currency: budget.currency,
      created_at: budget.created_at,
      updated_at: budget.updated_at
    }
  }
}
