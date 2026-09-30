import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountList } from './AccountList'

vi.mock('../../context/AlertContext', () => ({ useAlert: () => ({ confirm: vi.fn(), showAlert: vi.fn() }) }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: 'visible', shouldHideInvestment: () => false }) }))
afterEach(() => vi.unstubAllGlobals())

describe('account allocations with missing FX', () => {
  it('keeps native balances, withholds allocations, and retries rates', async () => {
    let rates: Record<string, number> = { USD: 1, HUF: 360 }
    vi.stubGlobal('fetch', vi.fn(async input => String(input).includes('open.er-api') ? Response.json({ rates }) : Response.json([])))
    const { container } = render(<AccountList accounts={[
      { id: 'huf', name: 'HUF account', type: 'cash', currency: 'HUF', balance: 100000 },
      { id: 'eur', name: 'EUR account', type: 'cash', currency: 'EUR', balance: 100 },
    ]} onAccountAdded={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('EUR')
    expect(screen.getByText('€100,00')).toBeInTheDocument()
    expect(screen.getByText('Allocation unavailable')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('NaN')
    rates = { USD: 1, HUF: 360, EUR: 0.9 }
    fireEvent.click(screen.getByRole('button', { name: 'Retry rates' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByText('Allocation unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('€100,00')).toBeInTheDocument()
  })
})
