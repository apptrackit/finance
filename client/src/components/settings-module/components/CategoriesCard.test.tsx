import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CategoriesCard } from './CategoriesCard'

const showAlert = vi.fn()
let mobile = false
vi.mock('../../../context/AlertContext', () => ({ useAlert: () => ({ showAlert }) }))
vi.mock('../useSettingsMobile', () => ({ useSettingsMobile: () => mobile }))
const categories = [
  { id: 'food', name: 'Food', type: 'expense', icon: '🍎' },
  { id: 'salary', name: 'Salary', type: 'income', icon: '💰' }
]
beforeEach(() => {
  mobile = false
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(Response.json(categories)))
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('filters categories and creates an income category from the selected tab', async () => {
  render(<CategoriesCard />)
  await screen.findByText('Food')
  expect(screen.queryByText('Salary')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'income 1' }))
  expect(screen.getByText('Salary')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'New category name' }), { target: { value: 'Bonus' } })
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ id: 'bonus', name: 'Bonus', type: 'income', icon: '📌' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  await screen.findByText('Bonus')
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toEqual({
    name: 'Bonus',
    type: 'income',
    icon: '📌'
  })
  expect(screen.getByRole('textbox', { name: 'New category name' })).toHaveValue('')
})

it('retains a failed edit and moves a successfully retyped category to its matching tab', async () => {
  render(<CategoriesCard />)
  await screen.findByText('Food')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Food' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Category name', exact: true }), {
    target: { value: 'Refunds' }
  })
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Category type' })).getByRole('button', { name: 'income' })
  )
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Try again' }, { status: 503 }))
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await waitFor(() =>
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Category not saved' }))
  )
  expect(screen.getByRole('textbox', { name: 'Category name', exact: true })).toHaveValue('Refunds')
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ id: 'food', name: 'Refunds', type: 'income', icon: '🍎' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await screen.findByText('Refunds')
  expect(screen.getByRole('button', { name: 'income 2' })).toHaveAttribute('aria-pressed', 'true')
})

it('confirms deletion inline, keeps the row on failure, and blocks duplicate requests', async () => {
  render(<CategoriesCard />)
  await screen.findByText('Food')
  fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.getByText('Food')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Category is in use' }, { status: 409 }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
  await waitFor(() =>
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Category not deleted' }))
  )
  expect(screen.getByText(/Delete “Food”/)).toBeInTheDocument()
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
  expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
  await act(async () => {
    resolve(new Response(null, { status: 204 }))
  })
  await screen.findByText('No expense categories yet')
})

it('offers retry after a failed read without accepting new writes', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 503 }))
  render(<CategoriesCard />)
  await screen.findByText('Could not load categories.')
  expect(screen.getByRole('textbox', { name: 'New category name' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Food')
})

it('opens a mobile sheet for editing, preserves errors, and confirms deletion in the sheet', async () => {
  mobile = true
  const view = render(<CategoriesCard />)
  await screen.findByText('Food')
  const edits = screen.getAllByRole('button', { name: 'Edit Food' })
  fireEvent.click(edits.at(-1)!)
  const sheet = screen.getByRole('dialog')
  expect(within(sheet).getByRole('textbox')).toHaveValue('Food')
  fireEvent.click(within(sheet).getByRole('button', { name: 'Delete', exact: true }))
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
  expect(within(sheet).getByRole('textbox')).toHaveValue('Food')
  view.rerender(<CategoriesCard active={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.style.overflow).not.toBe('hidden')
  view.rerender(<CategoriesCard active />)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
