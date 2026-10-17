import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdjustmentComposer } from './AdjustmentComposer'

const privacy = vi.hoisted(() => ({ hidden: false }))
vi.mock('../../context/PrivacyContext', () => ({ usePrivacy: () => ({ privacyMode: privacy.hidden ? 'hidden' : 'visible' }) }))
const categories = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', type: 'expense' as const },
  { id: 'household', name: 'Household', icon: '🧴', type: 'expense' as const },
  { id: 'salary', name: 'Salary', icon: '💼', type: 'income' as const },
]
afterEach(() => { cleanup(); privacy.hidden = false })

function setup(props: Partial<React.ComponentProps<typeof AdjustmentComposer>> = {}) {
  const onSave = vi.fn(async () => undefined)
  const onClose = vi.fn()
  render(<AdjustmentComposer isOpen accountName="OTP Bank" currency="HUF" oldBalance={2889100} newBalance={2840500}
    categories={categories} today="2026-10-14" onClose={onClose} onSave={onSave} {...props} />)
  return { onSave, onClose }
}

describe('AdjustmentComposer', () => {
  it('fixes the amount and account to the difference and saves a single line', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Balance adjustment · OTP Bank')
    expect(dialog).toHaveTextContent('−48 600')
    expect(dialog).toHaveTextContent('Balance 2 889 100 → 2 840 500 HUF')
    expect(within(dialog).getByLabelText('Account')).toBeDisabled()
    expect(within(dialog).getByLabelText('Category').querySelectorAll('option')).toHaveLength(3) // placeholder + 2 expense categories
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'groceries')
    await user.type(within(dialog).getByLabelText('Description'), ' Spar ')
    await user.click(within(dialog).getByRole('button', { name: 'Save and update balance' }))
    expect(onSave).toHaveBeenCalledWith({ date: '2026-10-14', description: 'Spar', excludeFromEstimate: false,
      lines: [{ category_id: 'groceries', amount: -48600, note: null }] })
  })

  it('splits the fixed difference over lines and requires the full amount to be assigned', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Split into categories' }))
    expect(within(dialog).getByLabelText('Amount for line 1')).toHaveValue('48 600')
    await user.selectOptions(within(dialog).getByLabelText('Category for line 1'), 'groceries')
    await user.selectOptions(within(dialog).getByLabelText('Category for line 2'), 'household')
    await user.type(within(dialog).getByLabelText('Amount for line 2'), '11350')
    expect(within(dialog).getByLabelText('Amount for line 1')).toHaveValue('37 250')
    await user.click(within(dialog).getByRole('button', { name: 'Save 2 and update balance' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ category_id: 'groceries', amount: -37250, note: null }, { category_id: 'household', amount: -11350, note: null }] }))
  })

  it('uses income categories and positive lines for a balance increase', async () => {
    const user = userEvent.setup()
    const { onSave } = setup({ oldBalance: 100, newBalance: 350 })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Category').querySelectorAll('option')).toHaveLength(2)
    expect(within(dialog).queryByText(/Exclude from estimate/)).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'salary')
    await user.click(within(dialog).getByRole('button', { name: 'Save and update balance' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ lines: [{ category_id: 'salary', amount: 250, note: null }] }))
  })

  it('keeps the draft and shows the error when saving fails, and cancel only closes', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValueOnce(new Error('This split changed. Refresh and try again.'))
    const { onClose } = setup({ onSave })
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Description'), 'Spar')
    await user.click(within(dialog).getByRole('button', { name: 'Save and update balance' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('This split changed. Refresh and try again.'))
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Spar')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('masks the balances and difference in privacy mode', () => {
    privacy.hidden = true
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveTextContent('48 600')
    expect(dialog).not.toHaveTextContent('2 889 100')
    expect(dialog).toHaveTextContent('••••••')
  })
})
