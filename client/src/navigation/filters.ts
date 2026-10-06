import { endOfMonth, format, isValid, parseISO, startOfMonth } from 'date-fns'
import type { IncomeExpensesTrendResolution } from '../components/analytics-module/IncomeExpensesTrendChart'
import type { TimePeriod } from '../components/analytics-module/types'

type Category = { id: string; type: 'income' | 'expense' }
export type DashboardFilters = {
  range: 'current' | 'custom' | 'allTime'
  startDate: string
  endDate: string
  category: string
  sort: 'date' | 'amount-high' | 'amount-low'
  view: 'list' | 'calendar'
}
export type AnalyticsFilters = {
  period: TimePeriod
  date: string
  pinned: boolean
  mode: 'actual' | 'projected'
  expenseCategory: string
  incomeCategory: string
  resolution: IncomeExpensesTrendResolution
}
export type FilterChange<T> = (patch: Partial<T>, replace?: boolean) => void

function calendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false
  const parsed = parseISO(value)
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value
}

function category(value: string | null, categories?: Category[], type?: Category['type']): string {
  if (!value || value === 'all' || value.length > 128) return 'all'
  return !categories || categories.some(item => item.id === value && (!type || item.type === type)) ? value : 'all'
}

export function parseDashboardFilters(params: URLSearchParams, today = new Date(), categories?: Category[]): DashboardFilters {
  const from = params.get('from'), to = params.get('to')
  const allTime = params.get('range') === 'allTime' || (from === '1900-01-01' && to === '2100-12-31')
  const custom = !allTime && calendarDate(from) && calendarDate(to) && from <= to
  const filters: DashboardFilters = {
    range: allTime ? 'allTime' : custom ? 'custom' : 'current',
    startDate: allTime ? '1900-01-01' : custom ? from : format(startOfMonth(today), 'yyyy-MM-dd'),
    endDate: allTime ? '2100-12-31' : custom ? to : format(endOfMonth(today), 'yyyy-MM-dd'),
    category: ['transfer', 'all-expenses', 'all-income'].includes(params.get('category') || '')
      ? params.get('category')! : category(params.get('category'), categories),
    sort: params.get('sort') === 'amount-high' || params.get('sort') === 'amount-low' ? params.get('sort') as DashboardFilters['sort'] : 'date',
    view: params.get('view') === 'calendar' ? 'calendar' : 'list',
  }
  // The calendar displays a single month, while All Time belongs to the list.
  if (filters.view === 'calendar') {
    if (filters.range === 'allTime') filters.view = 'list'
    else if (filters.range === 'custom') {
      const month = parseISO(filters.startDate)
      filters.startDate = format(startOfMonth(month), 'yyyy-MM-dd')
      filters.endDate = format(endOfMonth(month), 'yyyy-MM-dd')
    }
  }
  return filters
}

export function dashboardSearch(filters: DashboardFilters): string {
  const params = new URLSearchParams()
  if (filters.range === 'allTime') params.set('range', 'allTime')
  else if (filters.range === 'custom') { params.set('from', filters.startDate); params.set('to', filters.endDate) }
  if (filters.category !== 'all') params.set('category', filters.category)
  if (filters.sort !== 'date') params.set('sort', filters.sort)
  if (filters.view !== 'list') params.set('view', filters.view)
  return params.toString()
}

export function parseAnalyticsFilters(params: URLSearchParams, today = new Date(), categories?: Category[]): AnalyticsFilters {
  const period = params.get('period') === 'year' || params.get('period') === 'allTime' ? params.get('period') as TimePeriod : 'month'
  const month = params.get('month'), year = params.get('year')
  const monthDate = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null
  const yearDate = year && /^\d{4}$/.test(year) ? `${year}-01-01` : null
  const explicitDate = period === 'month' ? monthDate : period === 'year' ? yearDate : null
  const pinned = calendarDate(explicitDate)
  return {
    period, date: pinned ? explicitDate : format(startOfMonth(today), 'yyyy-MM-dd'), pinned,
    mode: params.get('mode') === 'projected' ? 'projected' : 'actual',
    expenseCategory: category(params.get('expenseCategory'), categories, 'expense'),
    incomeCategory: category(params.get('incomeCategory'), categories, 'income'),
    resolution: period !== 'month' && params.get('resolution') === 'quarter' ? 'quarter'
      : period === 'allTime' && params.get('resolution') === 'year' ? 'year' : 'default',
  }
}

export function analyticsSearch(filters: AnalyticsFilters): string {
  const params = new URLSearchParams()
  if (filters.period !== 'month') params.set('period', filters.period)
  if (filters.pinned && filters.period === 'month') params.set('month', filters.date.slice(0, 7))
  if (filters.pinned && filters.period === 'year') params.set('year', filters.date.slice(0, 4))
  if (filters.mode !== 'actual') params.set('mode', filters.mode)
  if (filters.expenseCategory !== 'all') params.set('expenseCategory', filters.expenseCategory)
  if (filters.incomeCategory !== 'all') params.set('incomeCategory', filters.incomeCategory)
  if (filters.resolution !== 'default') params.set('resolution', filters.resolution)
  return params.toString()
}
