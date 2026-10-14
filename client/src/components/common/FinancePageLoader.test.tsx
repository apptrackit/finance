import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FinancePageLoader } from './FinancePageLoader'
import { saveWidgetVisibility, WIDGET_DEFS, type WidgetId } from '../analytics-module/widgetConfig'

beforeEach(() => localStorage.clear())

describe('initial widget skeletons', () => {
  it.each(['dashboard', 'analytics', 'investments', 'accounts', 'recurring'])('announces %s loading without visible text or interactive placeholder controls', view => {
    render(<FinancePageLoader view={view} />)
    const loading = screen.getByRole('status', { name: 'Loading your finances' })
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(loading.textContent).toBe('')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('only shows Analytics widgets enabled in saved preferences', () => {
    const visibility = Object.fromEntries(WIDGET_DEFS.map(widget => [widget.id, false])) as Record<WidgetId, boolean>
    visibility['expenses-chart'] = true
    visibility['top-expenses'] = true
    saveWidgetVisibility(visibility)
    const { container } = render(<FinancePageLoader view="analytics" />)
    expect(Array.from(container.querySelectorAll('[data-skeleton-widget]')).map(element => element.getAttribute('data-skeleton-widget')))
      .toEqual(['expenses-chart', 'top-expenses'])
  })

  it('omits cash charts for a known portfolio without cash accounts', () => {
    const { container } = render(<FinancePageLoader view="analytics" accounts={[{ type: 'investment' }]} />)
    expect(container.querySelector('[data-skeleton-widget="cash-balance-trend"]')).toBeNull()
    expect(container.querySelector('[data-skeleton-widget="account-trends"]')).toBeNull()
    expect(container.querySelector('[data-skeleton-widget="expenses-chart"]')).not.toBeNull()
  })
})
