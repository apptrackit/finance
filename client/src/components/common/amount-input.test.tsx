import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AmountInput } from './amount-input'

function Harness({
  allowNegative = false,
  initialValue = '',
}: {
  allowNegative?: boolean
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <AmountInput
      aria-label="Amount"
      allowNegative={allowNegative}
      value={value}
      onValueChange={setValue}
    />
  )
}

describe('AmountInput', () => {
  it('preserves grouping while deleting and refilling an existing suffix', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="120 000" />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement

    await user.click(input)

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('120 00')
    expect(input.selectionStart).toBe(6)

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('120 0')
    expect(input.selectionStart).toBe(5)

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('120 ')
    expect(input.selectionStart).toBe(4)

    await user.keyboard('3')
    expect(input).toHaveValue('120 3')

    await user.keyboard('0')
    expect(input).toHaveValue('120 30')

    await user.keyboard('0')
    expect(input).toHaveValue('120 300')
    expect(input.selectionStart).toBe(7)
  })

  it('resumes grouping when the integer grows beyond the session width', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="120 000" />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement

    await user.click(input)
    await user.keyboard('{Backspace}{Backspace}{Backspace}3000')

    expect(input).toHaveValue('1 203 000')
    expect(input.selectionStart).toBe(9)
  })

  it('restores canonical grouping after growing and returning to the original width', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="120 000" />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement

    await user.click(input)
    await user.keyboard('0')
    expect(input).toHaveValue('1 200 000')

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('120 000')

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('120 00')
  })

  it('groups a fresh value as it grows and resets after a full clear', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="999 999" />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement

    await user.clear(input)
    await user.type(input, '1200')

    expect(input).toHaveValue('1 200')
    expect(input.selectionStart).toBe(5)
  })

  it('keeps the caret beside the edited digit when grouping changes in the middle', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="123" />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement

    await user.click(input)
    input.setSelectionRange(1, 1)
    await user.keyboard('0')

    expect(input).toHaveValue('1 023')
    expect(input.selectionStart).toBe(3)
    expect(input.selectionEnd).toBe(3)
  })

  it('canonicalizes a genuinely smaller value on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue="120 000" />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    await user.click(input)
    await user.keyboard('{Backspace}{Backspace}{Backspace}')
    expect(input).toHaveValue('120 ')

    await user.tab()
    expect(input).toHaveValue('120')
  })

  it('supports negative account-style values when enabled', async () => {
    const user = userEvent.setup()
    render(<Harness allowNegative initialValue="-120 000" />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    await user.click(input)
    await user.keyboard('{Backspace}{Backspace}{Backspace}300')

    expect(input).toHaveValue('-120 300')
  })

  it('normalizes pasted NBSP grouping and a decimal comma', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    await user.click(input)
    await user.paste('12\u00a0345,67')

    expect(input).toHaveValue('12 345.67')
  })
})
