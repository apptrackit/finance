import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useFinancialOutlookData } from '../hooks/useFinancialOutlookData'

afterEach(() => vi.unstubAllGlobals())

it('loads forecast reports only on demand and retains the complete cached result on a failed return-visit refresh', async () => {
  const fetchMock = vi.fn<typeof fetch>(async input => Response.json(String(input).includes('/latest')
    ? { snapshot: null } : { snapshots: [], next_cursor: null }))
  vi.stubGlobal('fetch', fetchMock)
  const { result, rerender } = renderHook(({ active }) => useFinancialOutlookData(active, 1), { initialProps: { active: false } })
  expect(fetchMock).not.toHaveBeenCalled()
  rerender({ active: true })
  await waitFor(() => expect(result.current.status.loaded).toBe(true))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const previous = result.current.data
  rerender({ active: false })
  let release: (response: Response) => void = () => {}
  fetchMock.mockImplementation(async input => String(input).includes('/latest')
    ? new Promise(resolve => { release = resolve }) : Response.json({ snapshots: [], next_cursor: null }))
  rerender({ active: true })
  await waitFor(() => expect(result.current.status.loading).toBe(true))
  expect(result.current.status.loaded).toBe(true)
  expect(result.current.data).toBe(previous)
  await act(async () => { release(Response.json({ error: 'Synthetic outage' }, { status: 503 })) })
  expect(result.current.data).toBe(previous)
  expect(result.current.status).toMatchObject({ loaded: true, error: true, stale: true })
})

it('does not publish a partially read or malformed initial forecast history as an empty result', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => Response.json(String(input).includes('/latest')
    ? { snapshot: null } : { snapshots: {} })))
  const { result } = renderHook(() => useFinancialOutlookData(true, 1))
  await waitFor(() => expect(result.current.status.error).toBe(true))
  expect(result.current.status.loaded).toBe(false)
  expect(result.current.data).toBeNull()
})
