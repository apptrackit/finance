import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoneyMapChart } from './MoneyMapChart'
import { PrivacyProvider, usePrivacy } from '../../context/PrivacyContext'

const category = (name: string, value: number) => ({ name, value, icon: '•', percentage: 0 })
const expenseOnly = {
  incomeData: [], expenseData: [category('Groceries', 14300.25), category('Utilities', 6500), category('Lifestyle', 6000)],
  totalIncome: 0, totalExpenses: 26800.25, masterCurrency: 'HUF',
}

let width = 340
let resize: (width: number) => void
const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  width = 340
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    private callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) { this.callback = callback }
    observe(target: Element) {
      resize = nextWidth => this.callback([{ target, contentRect: { width: nextWidth, height: 330 } } as ResizeObserverEntry], this)
      resize(width)
    }
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => { vi.stubGlobal('ResizeObserver', originalResizeObserver) })

function flowExtent() {
  const left = screen.getByRole('button', { name: /^Deficit:/ }).querySelector('rect')!
  const right = screen.getByRole('button', { name: /^• Groceries:/ }).querySelector('rect')!
  return Number(right.getAttribute('x')) + Number(right.getAttribute('width')) - Number(left.getAttribute('x'))
}

describe('Money Map responsive Sankey', () => {
  it.each([270, 325, 340, 380])('uses over 90%% of a narrow chart width (%i px) for the same Sankey flows', chartWidth => {
    width = chartWidth
    render(<MoneyMapChart {...expenseOnly} />, { wrapper: PrivacyProvider })
    expect(screen.getByRole('button', { name: /^Cash Flow → • Groceries:/ })).toBeInTheDocument()
    expect(flowExtent() / chartWidth).toBeGreaterThan(0.9)
  })

  it('adjusts when the card grows to desktop width and shrinks again', () => {
    render(<MoneyMapChart {...expenseOnly} />, { wrapper: PrivacyProvider })
    act(() => resize(960))
    expect(screen.getByRole('button', { name: /^Deficit:/ }).querySelector('rect')).toHaveAttribute('x', '110')
    expect(screen.getByRole('button', { name: /^• Groceries:/ }).querySelector('text')).toBeInTheDocument()
    act(() => resize(325))
    expect(flowExtent() / 325).toBeGreaterThan(0.9)
  })

  it('keeps tapped details open after mouse leave and allows closing them', () => {
    render(<MoneyMapChart {...expenseOnly} />, { wrapper: PrivacyProvider })
    const groceries = screen.getByRole('button', { name: /^• Groceries:/ })
    fireEvent.click(groceries)
    fireEvent.mouseLeave(groceries)
    expect(screen.getByRole('status')).toHaveTextContent(/• Groceries14\s300,25 HUF/)
    fireEvent.click(screen.getByRole('button', { name: 'Close cash flow details' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows full long names and flow amounts through keyboard inspection', () => {
    const longName = 'Household maintenance and unexpected appliance replacement'
    render(<MoneyMapChart {...expenseOnly} expenseData={[category(longName, 26800.25)]} />, { wrapper: PrivacyProvider })
    const flow = screen.getByRole('button', { name: new RegExp(`^Cash Flow → • ${longName}:`) })
    fireEvent.keyDown(flow, { key: 'Enter' })
    expect(screen.getByRole('status')).toHaveTextContent(longName)
    expect(screen.getByRole('status')).toHaveTextContent(/26\s800,25 HUF/)
    fireEvent.keyDown(flow, { key: ' ' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('masks visible, accessible, and selected amounts when privacy changes', () => {
    function PrivacyToggle() {
      const { togglePrivacyMode } = usePrivacy()
      return <button onClick={togglePrivacyMode}>Hide amounts</button>
    }
    render(<><MoneyMapChart {...expenseOnly} /><PrivacyToggle /></>, { wrapper: PrivacyProvider })
    fireEvent.click(screen.getByRole('button', { name: /^• Groceries:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide amounts' }))
    expect(screen.getByRole('status')).toHaveTextContent('••••••')
    expect(screen.getByRole('button', { name: '• Groceries: ••••••' })).toBeInTheDocument()
    expect(screen.queryByText(/HUF/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /HUF/ })).not.toBeInTheDocument()
  })

  it('does not keep selected amounts from a previous period after data changes', () => {
    const { rerender } = render(<MoneyMapChart {...expenseOnly} />, { wrapper: PrivacyProvider })
    fireEvent.click(screen.getByRole('button', { name: /^• Groceries:/ }))
    rerender(<MoneyMapChart {...expenseOnly} expenseData={[category('Travel', 100)]} totalExpenses={100} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '• Travel: 100 HUF' })).toBeInTheDocument()
  })

  it('keeps the empty state when no flows exist', () => {
    render(<MoneyMapChart {...expenseOnly} expenseData={[]} totalExpenses={0} />, { wrapper: PrivacyProvider })
    expect(screen.getByText('No cash flow data available')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cash Flow/ })).not.toBeInTheDocument()
  })
})
