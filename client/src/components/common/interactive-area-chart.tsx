import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { calendarTicks } from './calendar-ticks'

// Adapted from EasyUI's Interactive Area Chart (MIT; see licenses/easyui.txt).
// Retains the reference's smooth SVG curve, reveal and scrubbing treatment.
// Readouts use original observations; bounded controls prevent visual overshoot
// and every missing observation still breaks the line and fill.
export type AreaChartPoint = { date: string; value: number | null; reference?: number | null }
type Series = { label: string; color: string; dashed?: boolean; step?: boolean }
type InteractiveAreaChartProps = {
  data: AreaChartPoint[]
  label: string
  formatValue: (value: number | null) => string
  color?: string
  title?: string
  controls?: ReactNode
  showChange?: boolean
  periodLabel?: string
  reference?: Series
  hidden?: boolean
  showReadout?: boolean
  className?: string
  activeIndex?: number | null
  onInspect?: (index: number | null) => void
  renderTooltip?: (index: number) => ReactNode
  // Shares the legend row, so toggling the reference line keeps it in place.
  footer?: ReactNode
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value)
const fullDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function InteractiveAreaChart({ data, label, formatValue, color = 'hsl(var(--primary))', title, controls, showChange = false, periodLabel = 'in period', reference, hidden = false, showReadout = false, className, activeIndex, onInspect, renderTooltip, footer }: InteractiveAreaChartProps) {
  const uid = useId().replaceAll(':', '')
  const reduce = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 240 })
  const [selection, setSelection] = useState<{ data: AreaChartPoint[]; index: number } | null>(null)
  const internalIndex = selection?.data === data ? selection.index : null
  const index = activeIndex === undefined ? internalIndex : activeIndex
  const inspected = index != null && index >= 0 && index < data.length ? index : null
  const shown = data[inspected ?? data.length - 1]
  const hasData = data.length > 0

  useEffect(() => {
    const element = wrapRef.current
    if (!element || hidden) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hidden, hasData])

  const inspect = (next: number | null) => {
    setSelection(next === null ? null : { data, index: next })
    onInspect?.(next)
  }
  const { width, height } = size
  const pad = { top: 48, right: 12, bottom: 28, left: 48 }
  const bottom = height - pad.bottom
  const innerWidth = Math.max(1, width - pad.left - pad.right)
  const values = data.flatMap(point => reference ? [point.value, point.reference] : [point.value]).filter(finite)
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 1
  const padding = Math.max((maximum - minimum) * 0.2, Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.025, 1)
  const low = minimum - padding, high = maximum + padding
  const times = data.map(point => Date.parse(`${point.date}T00:00:00Z`))
  const start = times[0] ?? 0, span = (times.at(-1) ?? 0) - start
  const at = (time: number) => pad.left + (span > 0 ? (time - start) / span : 0.5) * innerWidth
  const x = (i: number) => at(times[i])
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * (bottom - pad.top)
  const ticks = [high, (high + low) / 2, low]
  const tooltipWidth = Math.min(renderTooltip ? 280 : 164, width)
  const tooltipLeft = inspected === null ? 0 : clamp(x(inspected) - tooltipWidth / 2, 0, Math.max(0, width - tooltipWidth))
  const first = data[0]?.value
  const change = finite(first) && first > 0 && finite(shown?.value) ? (shown.value - first) / first * 100 : null
  const seriesKey = `${data[0]?.date}:${data.at(-1)?.date}:${data.length}`
  // Calendar boundaries (days, months, years) placed by time, not by point index.
  const labels = !data.length ? [] : calendarTicks(data[0].date, data[data.length - 1].date, innerWidth)
    .map(tick => ({ key: tick.date, x: at(Date.parse(`${tick.date}T00:00:00Z`)), text: tick.label, major: tick.major }))

  const paths = (key: 'value' | 'reference', step = false) => {
    const segments: { line: string; area: string; single: number | null }[] = []
    let segment: number[] = []
    const flush = () => {
      if (!segment.length) return
      const first = segment[0], last = segment[segment.length - 1]
      const line = `M${x(first)} ${y(data[first][key]!)}` + segment.slice(1).map((i, offset) => {
        if (step) return ` H${x(i)} V${y(data[i][key]!)}`
        const position = offset + 1
        const before = segment[Math.max(0, position - 2)], previous = segment[position - 1]
        const after = segment[Math.min(segment.length - 1, position + 1)]
        const x1 = x(previous), x2 = x(i), y1 = y(data[previous][key]!), y2 = y(data[i][key]!)
        const slope = (y2 - y1) / (x2 - x1 || 1)
        const beforeSlope = before === previous ? slope : (y1 - y(data[before][key]!)) / (x1 - x(before) || 1)
        const afterSlope = after === i ? slope : (y(data[after][key]!) - y2) / (x(after) - x2 || 1)
        // Bound the smooth Bezier controls to this interval, so the curve has
        // no invented peaks and stays horizontal at plateaus and turning points.
        const tangent1 = beforeSlope * slope <= 0 ? 0 : (beforeSlope + slope) / 2
        const tangent2 = afterSlope * slope <= 0 ? 0 : (afterSlope + slope) / 2
        const third = (x2 - x1) / 3
        const c1y = clamp(y1 + tangent1 * third, Math.min(y1, y2), Math.max(y1, y2))
        const c2y = clamp(y2 - tangent2 * third, Math.min(y1, y2), Math.max(y1, y2))
        return ` C${x1 + third} ${c1y} ${x2 - third} ${c2y} ${x2} ${y2}`
      }).join('')
      segments.push({ line, area: `${line} L${x(last)} ${bottom} L${x(first)} ${bottom} Z`, single: segment.length === 1 ? first : null })
      segment = []
    }
    data.forEach((point, i) => { if (finite(point[key])) segment.push(i); else flush() })
    flush()
    return segments
  }

  const scrub = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!data.length || box.width === 0) return
    const target = (event.clientX - box.left) * width / box.width
    let nearest = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - target) < Math.abs(x(nearest) - target)) nearest = i
    inspect(nearest)
  }

  if (hidden) return <><div className="flex flex-wrap items-start justify-between gap-3">{title && <h3 className="text-[13px] text-muted-foreground">{title}</h3>}{controls}</div><div className={cn('flex h-60 items-center justify-center text-sm text-muted-foreground', className)}>Chart hidden for privacy</div>{footer && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{footer}</div>}</>
  if (!data.length) return <div className={cn('flex h-60 items-center justify-center text-sm text-muted-foreground', className)}>No data in this period</div>

  return <div className="min-w-0">
    {showReadout && <div className="mb-4 flex flex-col items-start justify-between gap-3 min-[480px]:flex-row min-[480px]:gap-4">
      <div className="min-w-0" aria-live="polite" aria-atomic="true">
        {title && <h3 className="text-[13px] font-normal text-muted-foreground">{title}</h3>}
        <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{formatValue(shown.value)}</p>
        <p className="mt-1 text-xs tabular-nums sm:text-[13px]">
          {showChange && change !== null && <span className={change >= 0 ? 'easyui-chart-positive' : 'easyui-chart-negative'}>{change > 0 ? '+' : ''}{change.toFixed(1)}% </span>}
          <span className="text-muted-foreground">{inspected !== null ? fullDate(shown.date) : showChange ? `${periodLabel} · balance change` : `${fullDate(shown.date)} · latest in period`}</span>
        </p>
      </div>
      {controls}
    </div>}
    <div ref={wrapRef} className={cn('relative h-[280px] min-w-0', className)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} role="slider" tabIndex={0}
        aria-label={`${label}. Use arrow keys to inspect dates.`} aria-orientation="horizontal"
        aria-valuemin={0} aria-valuemax={data.length - 1} aria-valuenow={inspected ?? data.length - 1}
        aria-valuetext={`${fullDate(shown.date)} · ${formatValue(shown.value)}`}
        className="block select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
        onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => inspect(null)} onPointerCancel={() => inspect(null)}
        onBlur={() => inspect(null)} onKeyDown={event => {
          let next: number | null
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamp((inspected ?? data.length - 1) - 1, 0, data.length - 1)
          else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamp((inspected ?? data.length - 1) + 1, 0, data.length - 1)
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = data.length - 1
          else if (event.key === 'Escape') next = null
          else return
          event.preventDefault()
          inspect(next)
        }}>
        <defs><clipPath id={`${uid}-clip`}><motion.rect key={seriesKey} x={0} y={0} height={height} initial={reduce ? false : { width: 0 }} animate={{ width }} transition={{ duration: reduce ? 0 : 1.1, ease: [0.77, 0, 0.175, 1] }} /></clipPath><linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <g aria-hidden="true">
          {ticks.map((value, i) => <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="hsl(var(--border))" strokeOpacity={0.55} />
            <text x={pad.left - 10} y={y(value)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">{Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}</text>
          </g>)}
          {labels.map(tick => <g key={tick.key}>
            {tick.major && <line x1={tick.x} x2={tick.x} y1={pad.top} y2={bottom} stroke="hsl(var(--border))" strokeDasharray="2 4" />}
            <text x={tick.x} y={height - 6} data-axis-label="x" data-major={tick.major ? '' : undefined}
              textAnchor={tick.x - pad.left < 20 ? 'start' : width - pad.right - tick.x < 20 ? 'end' : 'middle'}
              className={cn('text-[11px]', tick.major ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>{tick.text}</text>
          </g>)}
          {reference && <g data-series="reference">{paths('reference', reference.step).map((path, i) => <g key={i}>
            <path d={path.line} fill="none" stroke={reference.color} strokeWidth={1.5} strokeDasharray={reference.dashed ? '6 3' : undefined} />
            {path.single !== null && <circle cx={x(path.single)} cy={y(data[path.single].reference!)} r={2} fill={reference.color} />}
          </g>)}</g>}
          <g data-series="value" clipPath={`url(#${uid}-clip)`}>{paths('value').map((path, i) => <g key={i}>
            <path d={path.area} fill={`url(#${uid}-fill)`} />
            <path d={path.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {path.single !== null && <circle cx={x(path.single)} cy={y(data[path.single].value!)} r={3} fill={color} />}
          </g>)}</g>
          {inspected !== null && <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.15 }} pointerEvents="none">
            <line x1={x(inspected)} x2={x(inspected)} y1={pad.top} y2={bottom} stroke={color} strokeOpacity={0.3} strokeDasharray="3 3" />
            {finite(shown.value) && <circle cx={x(inspected)} cy={y(shown.value)} r={4.5} fill="hsl(var(--card))" stroke={color} strokeWidth={2} />}
          </motion.g>}
        </g>
      </svg>
      {inspected !== null && <motion.div className="pointer-events-none absolute top-0 z-10 max-w-full [&>div]:max-w-full" initial={{ opacity: 0, x: tooltipLeft }} animate={{ opacity: 1, x: tooltipLeft }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42, mass: 0.6, opacity: { duration: 0.15 } }} style={{ width: tooltipWidth, left: 0 }}>
        {renderTooltip ? renderTooltip(inspected) : <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
          <p className="text-[11px] text-muted-foreground">{fullDate(shown.date)}</p>
          <p className="text-sm font-medium tabular-nums" style={{ color }}>{formatValue(shown.value)}</p>
        </div>}
      </motion.div>}
    </div>
    {(reference || footer) && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      {reference && <div className="flex flex-wrap gap-x-5 gap-y-1 px-2 text-xs text-muted-foreground sm:px-0">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: color }} />{label}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t" style={{ borderColor: reference.color, borderStyle: reference.dashed ? 'dashed' : 'solid' }} />{reference.label}</span>
      </div>}
      {footer && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{footer}</div>}
    </div>}
  </div>
}
