import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InteractiveAreaChart } from './interactive-area-chart'
import type { AreaChartPoint } from './interactive-area-chart'

const points: AreaChartPoint[] = [
  { date: '2026-10-01', value: -100, reference: -120 },
  { date: '2026-10-02', value: null, reference: null },
  { date: '2026-10-10', value: 0, reference: -50 },
  { date: '2026-10-11', value: 200, reference: 100 },
]
const money = (value: number | null) => value === null ? 'Unavailable' : `${value} EUR`
const props = { data: points, label: 'Cash balance', formatValue: money, showReadout: true }

describe('InteractiveAreaChart', () => {
  it('reads original observations by keyboard, including gaps and zero, and resets on Escape', () => {
    render(<InteractiveAreaChart {...props} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 11, 2026 · 200 EUR')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 1, 2026 · -100 EUR')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 2, 2026 · Unavailable')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 10, 2026 · 0 EUR')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', '3')
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(screen.getByText('Oct 11, 2026 · latest in period')).toBeVisible()
  })

  it('snaps pointer and touch inspection to the nearest real date on an irregular time axis', () => {
    const inspect = vi.fn()
    render(<InteractiveAreaChart {...props} onInspect={inspect} />)
    const slider = screen.getByRole('slider')
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 240, width: 640, height: 240, toJSON: () => ({}) })
    // jsdom does not implement PointerEvent; use MouseEvent's coordinate support.
    const event = new MouseEvent('pointermove', { bubbles: true, clientX: 115 })
    fireEvent(slider, event)
    expect(inspect).toHaveBeenLastCalledWith(1)
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 2, 2026 · Unavailable')
    fireEvent(slider, new MouseEvent('pointerdown', { bubbles: true, clientX: 628 }))
    expect(inspect).toHaveBeenLastCalledWith(3)
    fireEvent.pointerCancel(slider)
    expect(inspect).toHaveBeenLastCalledWith(null)
  })

  it('breaks both paths at missing observations and keeps the reference stepped', () => {
    const { container } = render(<InteractiveAreaChart {...props} reference={{ label: 'Net invested', color: 'gray', step: true, dashed: true }} />)
    const primary = container.querySelector('[data-series=value]')!
    expect(primary.querySelectorAll('path[fill=none]')).toHaveLength(2)
    expect(primary.querySelectorAll('circle')).toHaveLength(1)
    const lines = container.querySelectorAll('[data-series=reference] path')
    expect(lines).toHaveLength(2)
    expect(lines[1].getAttribute('d')).toContain(' H')
    expect(lines[1]).toHaveAttribute('stroke-dasharray', '6 3')
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('removes values, chart geometry and accessible financial labels in privacy mode', () => {
    const { container, rerender } = render(<InteractiveAreaChart {...props} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    rerender(<InteractiveAreaChart {...props} hidden />)
    expect(screen.getByText('Chart hidden for privacy')).toBeVisible()
    expect(container.querySelector('svg')).toBeNull()
    expect(container).not.toHaveTextContent('EUR')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('handles single-point, flat, negative and empty datasets without invalid geometry', () => {
    const { container, rerender } = render(<InteractiveAreaChart {...props} data={[points[0]]} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '0')
    expect(container.querySelector('[data-series=value] circle')).toBeInTheDocument()
    rerender(<InteractiveAreaChart {...props} data={[points[0], { ...points[0], date: '2026-10-02' }]} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    rerender(<InteractiveAreaChart {...props} data={[]} />)
    expect(screen.getByText('No data in this period')).toBeVisible()
  })

  it('clears inspection when the data is replaced and gives simultaneous charts unique gradients', () => {
    const { container, rerender } = render(<InteractiveAreaChart {...props} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    rerender(<InteractiveAreaChart {...props} data={[{ date: '2026-11-01', value: 500 }]} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Nov 1, 2026 · 500 EUR')
    rerender(<><section aria-label="first"><InteractiveAreaChart {...props} /></section><InteractiveAreaChart {...props} /></>)
    const ids = [...container.querySelectorAll('linearGradient')].map(element => element.id)
    expect(new Set(ids).size).toBe(2)
    expect(within(screen.getByRole('region', { name: 'first' })).getByRole('slider')).toBeVisible()
  })
})
