import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountShortcuts } from './AccountShortcuts'
import { SIDEBAR_ACCOUNTS_STORAGE_KEY, readSidebarAccountPreferences } from './sidebar-accounts.storage'
import type { ValuedAccount } from '../../lib/account-order'
import { accountValueForOrdering } from '../../lib/account-order'

const privacy = vi.hoisted(() => ({ hidden: false }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.hidden ? 'hidden' : 'visible' }) }))
const cash: ValuedAccount[] = Array.from({ length: 7 }, (_, i) => ({ id: `cash-${i}`, name: `Cash ${i + 1}`, type: 'cash', balance: i === 0 ? 1234567.89 : 1000 / (i + 1), currency: 'HUF' }))
const investments: ValuedAccount[] = Array.from({ length: 4 }, (_, i) => ({ id: `asset-${i}`, name: `Asset ${i + 1}`, type: 'investment', balance: 25.06912638, currency: 'SHARE' }))
const values = Object.fromEntries([...cash.map((account, index) => [account.id, 1000000 / (index + 1)]), ...investments.map((account, index) => [account.id, 160000 / (index + 1)])])
const props = { accounts: [...cash, ...investments], values, reportingCurrency: 'HUF', status: { loaded: true, error: false }, valuationLoading: false }
function open(overrides = {}) {
  return render(<MemoryRouter><AccountShortcuts {...props} {...overrides} /></MemoryRouter>)
}
beforeEach(() => { localStorage.clear(); privacy.hidden = false })
afterEach(cleanup)

describe('compact sidebar account groups', () => {
  it('shows every account in converted order and links the Accounts title to management', () => {
    // Legacy preview preferences must not truncate the list after this change.
    localStorage.setItem(SIDEBAR_ACCOUNTS_STORAGE_KEY, JSON.stringify({ cash: { collapsed: false }, investment: { collapsed: false } }))
    open({ accounts: [...props.accounts].reverse() })
    const cashGroup = within(screen.getByRole('region', { name: 'Cash account shortcuts' }))
    const investmentGroup = within(screen.getByRole('region', { name: 'Investment account shortcuts' }))
    expect(cashGroup.getAllByRole('link')).toHaveLength(7)
    expect(investmentGroup.getAllByRole('link')).toHaveLength(4)
    expect(cashGroup.getAllByRole('link')[0]).toHaveTextContent('Cash 11.23M HUF')
    expect(screen.queryByRole('button', { name: /Show all|Show top 3/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('href', '/accounts')
    expect(screen.queryByRole('link', { name: /Manage accounts/ })).not.toBeInTheDocument()
  })

  it('persists independent collapse preferences on remount and shows the full group when expanded', () => {
    const view = open()
    fireEvent.click(screen.getByRole('button', { name: 'Investments (4)' }))
    expect(screen.getByRole('button', { name: 'Investments (4)' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('region', { name: 'Investment account shortcuts' })).queryAllByRole('link')).toHaveLength(0)
    view.unmount()
    open()
    expect(within(screen.getByRole('region', { name: 'Cash account shortcuts' })).getAllByRole('link')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Investments (4)' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Investments (4)' }))
    expect(within(screen.getByRole('region', { name: 'Investment account shortcuts' })).getAllByRole('link')).toHaveLength(4)
  })

  it('shows compact cash and investment money, with exact balances and quantities on hover', () => {
    open()
    const cashLink = screen.getByRole('link', { name: 'Cash 1, 1.23M HUF' })
    expect(cashLink).toHaveAttribute('title', expect.stringMatching(/1\s234\s567,89 HUF/))
    const investmentLink = screen.getByRole('link', { name: 'Asset 1, 160K HUF' })
    expect(investmentLink).toHaveAttribute('title', expect.stringContaining('Value: 160'))
    expect(investmentLink).toHaveAttribute('title', expect.stringContaining('Holding: 25,06912638 SHARE'))
    expect(investmentLink.textContent).not.toContain('SHARE')
  })

  it('masks money and every tooltip quantity in privacy mode', () => {
    privacy.hidden = true
    const { container } = open()
    expect(container).not.toHaveTextContent('1.23M')
    expect(container).not.toHaveTextContent('160K')
    const links = within(screen.getByRole('region', { name: 'Cash account shortcuts' })).getAllByRole('link')
    expect(links[0]).toHaveAttribute('title', 'Cash 1')
    expect(screen.getByRole('link', { name: 'Asset 1, ••••••' })).toHaveAttribute('title', 'Asset 1')
    expect(container.querySelector('a[title*="SHARE"]')).toBeNull()
    expect(container).not.toHaveTextContent('%')
    expect(container.querySelector('[style]')).toBeNull()
    expect(links[0]).toHaveAccessibleDescription('Share hidden')
  })

  it('keeps unknown values last and displays unavailable investment prices honestly', () => {
    open({ accounts: investments, values: { 'asset-0': null, 'asset-1': 2000, 'asset-2': 1000, 'asset-3': 0 } })
    const group = within(screen.getByRole('region', { name: 'Investment account shortcuts' }))
    expect(group.getAllByRole('link').at(-1)).toHaveTextContent('Asset 1Unavailable')
    expect(screen.getByText('Unavailable values sort last.')).toBeInTheDocument()
  })

  it('supports empty/loading states and short groups', () => {
    const view = open({ accounts: [] })
    expect(screen.getByText('No active accounts yet')).toBeInTheDocument()
    view.unmount()
    open({ accounts: cash.slice(0, 2) })
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('ignores malformed preferences and unknown fields', () => {
    localStorage.setItem(SIDEBAR_ACCOUNTS_STORAGE_KEY, '{broken')
    expect(readSidebarAccountPreferences().cash).toEqual({ collapsed: false })
    localStorage.setItem(SIDEBAR_ACCOUNTS_STORAGE_KEY, JSON.stringify({ cash: { collapsed: 'true', showAll: true }, investment: null, private_payload: 'ignored' }))
    expect(readSidebarAccountPreferences()).toEqual({ cash: { collapsed: false }, investment: { collapsed: false } })
  })
})

describe('sidebar account shares', () => {
  it('matches Accounts shares from converted cash, manual assets, and market values in separate groups', () => {
    const accounts = [
      { id: 'local', name: 'Local bank', type: 'cash', balance: 60000, currency: 'HUF' },
      { id: 'foreign', name: 'Euro bank', type: 'cash', balance: 100, currency: 'EUR', exclude_from_cash_balance: true, exclude_from_net_worth: true },
      { id: 'stock', name: 'Stock', type: 'investment', balance: 5, currency: 'SHARE', quote_currency: 'EUR', symbol: 'TEST', asset_type: 'stock' },
      { id: 'manual', name: 'Manual asset', type: 'investment', balance: 100000, currency: 'HUF', asset_type: 'manual' },
      { id: 'archived', name: 'Archived bank', type: 'cash', balance: 0, currency: 'EUR', archived_at: 1 },
    ]
    const converted = Object.fromEntries(accounts.map(account => [account.id, accountValueForOrdering(account, { TEST: { regularMarketPrice: 150, currency: 'USD' } }, 'HUF', { HUF: 1, EUR: 1 / 400, USD: 1 / 360 }).value]))
    open({ accounts, values: converted })
    for (const [name, percentage, basis] of [['Local bank', 60, 'cash balances'], ['Euro bank', 40, 'cash balances'], ['Stock', 75, 'investment values'], ['Manual asset', 25, 'investment values']] as const) {
      const row = screen.getByRole('link', { name: new RegExp(`^${name},`) })
      expect(row).toHaveAccessibleDescription(`${percentage.toFixed(1)}% of active ${basis}`)
      expect(row.querySelector('[style]')).toHaveStyle({ width: `${percentage}%` })
      expect(row).toHaveAttribute('title', expect.stringContaining(`${percentage.toFixed(1)}%`))
    }
    expect(screen.queryByRole('link', { name: /Archived bank/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cash accounts (2)' })).toHaveAttribute('title', expect.stringContaining('including accounts excluded from totals'))
  })

  it.each([null, undefined, NaN, Infinity])('withholds an incomplete group without affecting the other group (%s)', unknown => {
    open({ accounts: [cash[0], cash[1], investments[0]], values: { 'cash-0': 100, 'cash-1': unknown, 'asset-0': 200 } })
    const group = screen.getByRole('region', { name: 'Cash account shortcuts' })
    for (const row of within(group).getAllByRole('link')) {
      expect(row).toHaveAccessibleDescription('Share unavailable: a value in this group is missing')
      expect(row.querySelector('[style]')).toBeNull()
      expect(row).not.toHaveTextContent('%')
    }
    expect(within(group).getByText('Shares unavailable · missing values.')).toBeInTheDocument()
    const investment = screen.getByRole('link', { name: 'Asset 1, 200 HUF' })
    expect(investment).toHaveAccessibleDescription('100.0% of active investment values')
    expect(investment.querySelector('[style]')).toHaveStyle({ width: '100%' })
  })

  it('distinguishes loading shares from unavailable shares and recovers when values arrive', () => {
    const view = open({ accounts: cash.slice(0, 2), values: { 'cash-0': 100, 'cash-1': null }, valuationLoading: true })
    expect(screen.getByText('Loading shares…')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Cash 1,/ })).toHaveAccessibleDescription('Loading share')
    view.rerender(<MemoryRouter><AccountShortcuts {...props} accounts={cash.slice(0, 2)} values={{ 'cash-0': 100, 'cash-1': 100 }} /></MemoryRouter>)
    expect(screen.queryByText('Loading shares…')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Cash 1,/ })).toHaveAccessibleDescription('50.0% of active cash balances')
  })

  it('keeps debts separate and renders zero totals as zero shares', () => {
    const view = open({ accounts: cash.slice(0, 3), values: { 'cash-0': 100, 'cash-1': -50, 'cash-2': 0 } })
    const positive = screen.getByRole('link', { name: /^Cash 1,/ })
    const negative = screen.getByRole('link', { name: /^Cash 2,/ })
    const zero = screen.getByRole('link', { name: /^Cash 3,/ })
    expect(positive).toHaveAccessibleDescription('100.0% of active cash balances')
    expect(negative).toHaveAccessibleDescription('Negative balance; excluded from positive balance shares')
    expect(negative).toHaveTextContent('Negative')
    expect(negative.querySelector('[style]')).toHaveStyle({ width: '0%' })
    expect(zero).toHaveAccessibleDescription('0.0% of active cash balances')
    view.unmount()
    open({ accounts: cash.slice(0, 2), values: { 'cash-0': 0, 'cash-1': 0 } })
    for (const row of within(screen.getByRole('region', { name: 'Cash account shortcuts' })).getAllByRole('link')) {
      expect(row).toHaveAccessibleDescription('0.0% of active cash balances')
      expect(row.querySelector('[style]')).toHaveStyle({ width: '0%' })
    }
  })
})
