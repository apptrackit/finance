import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './action-menu'

afterEach(cleanup)
const icon = <span aria-hidden="true">*</span>
describe('anchored action menu', () => {
  it('navigates enabled actions with arrow keys and restores trigger focus on Escape', async () => {
    render(<ActionMenu label="Sample" items={[
      { label: 'Edit details', description: 'Name and balance', icon, onSelect: vi.fn() },
      { label: 'Archive', description: 'Unavailable', icon, disabled: true, onSelect: vi.fn() },
      { label: 'Delete', description: 'Remove history', icon, onSelect: vi.fn(), destructive: true },
    ]} />)
    const trigger = screen.getByRole('button', { name: 'Actions for Sample' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const menu = await screen.findByRole('menu', { name: 'Sample actions' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit details' })).toHaveFocus())
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('selects an action once, closes, and dismisses on outside pointer events', async () => {
    const select = vi.fn()
    render(<><button>Elsewhere</button><ActionMenu label="Sample" items={[{ label: 'Edit', description: 'Details', icon, onSelect: select }]} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Sample' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    expect(select).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Sample' }))
    await screen.findByRole('menu')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
