import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SplitTransactionModal } from './SplitTransactionModal'

describe('SplitTransactionModal', () => {
  it('leaves closing to the successful save handler', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    render(
      <SplitTransactionModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        totalAmount={10}
        accountCurrency="HUF"
        categories={[{ id: 'income', name: 'Income', type: 'income' }]}
        defaultDate="2026-09-10"
        mode="single"
      />
    )

    await user.selectOptions(screen.getByLabelText('Category'), 'income')
    await user.click(screen.getByRole('button', { name: 'Confirm Transaction' }))

    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ amount: 10, category_id: 'income' })])
    expect(onClose).not.toHaveBeenCalled()
  })
})
