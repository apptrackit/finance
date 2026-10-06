import { describe, expect, it } from 'vitest'
import { analyticsSearch, dashboardSearch, parseAnalyticsFilters, parseDashboardFilters } from './filters'

const today = new Date(2026, 9, 6, 23, 30)
const params = (query = '') => new URLSearchParams(query)
const categories = [{ id: 'food', type: 'expense' as const }, { id: 'salary', type: 'income' as const }]

describe('view URL contract', () => {
  it('uses the local current month and keeps an explicitly dated current-month link fixed', () => {
    expect(parseDashboardFilters(params(), today)).toMatchObject({ range: 'current', startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(dashboardSearch(parseDashboardFilters(params(), today))).toBe('')
    const pinned = parseDashboardFilters(params('from=2026-10-01&to=2026-10-31'), today)
    expect(dashboardSearch(pinned)).toBe('from=2026-10-01&to=2026-10-31')
    expect(parseDashboardFilters(params(dashboardSearch(pinned)), new Date(2027, 0, 1))).toEqual(pinned)
  })

  it('round-trips custom ranges, filters, calendar and All Time without including search/form content', () => {
    const filtered = parseDashboardFilters(params('from=2024-02-29&to=2024-03-03&category=food&sort=amount-low&view=calendar&q=private&amount=123'), today, categories)
    const query = dashboardSearch(filtered)
    expect(parseDashboardFilters(params(query), today, categories)).toEqual(filtered)
    expect(query).not.toMatch(/private|amount=123|q=/)
    expect(dashboardSearch(parseDashboardFilters(params('from=1900-01-01&to=2100-12-31'), today))).toBe('range=allTime')
  })

  it.each(['from=2026-02-29&to=2026-03-01', 'from=2026-10-31&to=2026-10-01', 'from=2026-10-01', 'from=0001-01-01&to=2026-10-01', 'from=invalid&to=also-invalid'])('recovers an invalid dashboard range: %s', query => {
    expect(parseDashboardFilters(params(query), today)).toMatchObject({ range: 'current', startDate: '2026-10-01', endDate: '2026-10-31' })
  })

  it('retains category IDs until data arrives, then validates ID and category type', () => {
    expect(parseDashboardFilters(params('category=missing'), today).category).toBe('missing')
    expect(parseDashboardFilters(params('category=missing'), today, categories).category).toBe('all')
    expect(parseAnalyticsFilters(params('incomeCategory=food&expenseCategory=salary'), today, categories)).toMatchObject({ incomeCategory: 'all', expenseCategory: 'all' })
    for (const preset of ['transfer', 'all-expenses', 'all-income']) {
      expect(parseDashboardFilters(params(`category=${preset}`), today, []).category).toBe(preset)
    }
  })

  it.each(['month=2024-02&mode=projected&incomeCategory=salary&expenseCategory=food', 'period=year&year=2025&resolution=quarter', 'period=allTime&resolution=year'])('round-trips Analytics filters: %s', query => {
    const filtered = parseAnalyticsFilters(params(query), today, categories)
    expect(parseAnalyticsFilters(params(analyticsSearch(filtered)), today, categories)).toEqual(filtered)
  })

  it('normalizes invalid periods, dates, enums and unknown parameters', () => {
    expect(analyticsSearch(parseAnalyticsFilters(params('period=invalid&month=2026-13&mode=no&resolution=no&notes=private'), today))).toBe('')
    expect(dashboardSearch(parseDashboardFilters(params('sort=no&view=no&notes=private'), today))).toBe('')
  })

  it('keeps calendar ranges consistent with its single-month controls', () => {
    expect(parseDashboardFilters(params('view=calendar&from=2024-02-29&to=2024-03-03'), today))
      .toMatchObject({ startDate: '2024-02-01', endDate: '2024-02-29', view: 'calendar' })
    expect(parseDashboardFilters(params('view=calendar&range=allTime'), today)).toMatchObject({ range: 'allTime', view: 'list' })
  })
})
