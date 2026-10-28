import { render, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCalendarAxis } from './calendar-axis'

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`)

describe('useCalendarAxis', () => {
  it('gives Recharts calendar tick times and renders emphasized year labels', () => {
    const { result } = renderHook(() => useCalendarAxis(utc('2024-10-27'), utc('2026-10-27'), { plotInset: 40 }))
    const { ticks, tick, interval } = result.current.axisProps
    expect(interval).toBe(0)
    expect(ticks).toContain(utc('2025-01-01'))
    const { container } = render(<svg>{ticks.map(time => <g key={time}>{tick({ x: 10, y: 10, payload: { value: time } })}</g>)}</svg>)
    const labels = [...container.querySelectorAll('[data-axis-label="x"]')]
    expect(labels[0]).toHaveTextContent('2025')
    expect(labels[0]).toHaveAttribute('data-major')
    expect(labels[1]).not.toHaveAttribute('data-major')
  })

  it('maps local-midnight chart times and has no ticks without a range', () => {
    const local = (date: string) => new Date(`${date}T00:00:00`).getTime()
    const { result } = renderHook(() => useCalendarAxis(local('2026-10-01'), local('2026-10-27'), { local: true }))
    expect(result.current.axisProps.ticks[0]).toBe(local('2026-10-01'))
    expect(renderHook(() => useCalendarAxis(undefined, undefined)).result.current.axisProps.ticks).toEqual([])
  })
})
