import { describe, expect, it } from 'vitest'
import { calendarTicks } from './calendar-ticks'

const labels = (start: string, end: string, width: number) => calendarTicks(start, end, width).map(tick => tick.label)

describe('calendar axis ticks', () => {
  it('labels month views on calendar days that fit the width', () => {
    expect(labels('2026-10-01', '2026-10-27', 900)).toEqual(['Oct 1', 'Oct 4', 'Oct 7', 'Oct 10', 'Oct 13', 'Oct 16', 'Oct 19', 'Oct 22', 'Oct 25'])
    expect(labels('2026-10-01', '2026-10-27', 280)).toEqual(['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22'])
  })

  it('labels year views on month starts, thinning to alternate months on narrow widths', () => {
    expect(labels('2026-01-01', '2026-10-27', 900)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
    expect(calendarTicks('2026-01-01', '2026-10-27', 280)).toEqual([
      { date: '2026-01-01', label: 'Jan' }, { date: '2026-03-01', label: 'Mar' }, { date: '2026-05-01', label: 'May' },
      { date: '2026-07-01', label: 'Jul' }, { date: '2026-09-01', label: 'Sep' },
    ])
  })

  it('labels multi-year spans on quarters, halves or years and names each January by year', () => {
    expect(labels('2024-10-27', '2026-10-27', 900)).toEqual(['2025', 'Apr', 'Jul', 'Oct', '2026', 'Apr', 'Jul', 'Oct'])
    expect(labels('2024-10-27', '2026-10-27', 280)).toEqual(['2025', 'Jul', '2026', 'Jul'])
    expect(labels('2016-01-01', '2026-10-27', 280)).toEqual(['2016', '2018', '2020', '2022', '2024', '2026'])
  })

  it('never crowds the 1st of a month after a month-end tick and handles short or invalid spans', () => {
    expect(labels('2026-01-25', '2026-02-10', 900).filter(label => label.startsWith('Jan 3'))).toEqual([])
    expect(labels('2026-10-26', '2026-10-27', 300)).toEqual(['Oct 26', 'Oct 27'])
    expect(calendarTicks('2026-10-27', '2026-10-01', 300)).toEqual([])
  })
})
