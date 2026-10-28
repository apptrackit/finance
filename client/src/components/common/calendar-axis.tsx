import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { cn } from '../../lib/utils'
import { calendarTicks } from './calendar-ticks'

type AxisTick = { label: string; major?: boolean; anchor: 'start' | 'middle' | 'end' }
type TickProps = { x?: number | string; y?: number | string; payload?: { value?: unknown } }

const utcTime = (date: string) => Date.parse(`${date}T00:00:00Z`)
const utcDate = (time: number) => new Date(time).toISOString().slice(0, 10)
const localTime = (date: string) => parseISO(date).getTime()
const localDate = (time: number) => format(new Date(time), 'yyyy-MM-dd')

// Calendar-aligned ticks for Recharts time axes, matching InteractiveAreaChart.
// Attach `ref` to the chart's sizing container; `plotInset` is the width the
// Y axis and margins take from it. `local` charts store local-midnight times.
export function useCalendarAxis(start: number | undefined, end: number | undefined, { plotInset = 64, local = false }: { plotInset?: number; local?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => { const next = element.getBoundingClientRect().width; if (next > 0) setWidth(next) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(1, width - plotInset)
  const ticks = new Map<number, AxisTick>()
  if (start != null && end != null && Number.isFinite(start) && Number.isFinite(end)) {
    const toTime = local ? localTime : utcTime, toDate = local ? localDate : utcDate
    for (const tick of calendarTicks(toDate(start), toDate(end), plotWidth)) {
      const time = toTime(tick.date)
      const offset = end > start ? (time - start) / (end - start) * plotWidth : plotWidth / 2
      ticks.set(time, { label: tick.label, major: tick.major, anchor: offset < 20 ? 'start' : plotWidth - offset < 20 ? 'end' : 'middle' })
    }
  }

  const renderTick = ({ x, y, payload }: TickProps) => {
    const tick = ticks.get(Number(payload?.value))
    if (!tick) return <g />
    return <text x={Number(x)} y={Number(y)} dy={12} textAnchor={tick.anchor} fontSize={10} data-axis-label="x" data-major={tick.major ? '' : undefined}
      className={cn(tick.major ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>{tick.label}</text>
  }

  return { ref, axisProps: { ticks: [...ticks.keys()], interval: 0 as const, tick: renderTick } }
}
